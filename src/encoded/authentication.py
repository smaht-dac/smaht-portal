import requests
import structlog
from jwt import exceptions as jwt_exceptions
from dcicutils.redis_tools import RedisSessionToken
from snovault.authentication import (
    NamespacedAuthenticationPolicy,
    BasicAuthAuthenticationPolicy,
    basic_auth_check,
    Auth0AuthenticationPolicy,
    LoginDenied,
    get_jwt, redis_is_active, JWT_DECODING_ALGORITHMS
)
from snovault import COLLECTIONS
from snovault.calculated import calculate_properties
from operator import itemgetter
from dcicutils.misc_utils import ignored
from pyramid.security import NO_PERMISSION_REQUIRED
from pyramid.view import view_config
from snovault.project_app import app_project
from snovault.redis.interfaces import REDIS
from snovault.schema_utils import validate_request
from snovault.util import debug_log
from snovault.crud_views import collection_add as sno_collection_add
from pyramid.httpexceptions import HTTPForbidden, HTTPUnauthorized
from urllib.parse import urlencode
import re

from snovault.validation import ValidationFailure
from .audit_logging import authenticated_actor_fields, result_subject_uuid, subject_uuid_fields
from .okta import (
    OktaConfigurationError,
    decode_okta_id_token,
    okta_is_configured,
    token_is_asymmetrically_signed,
)


log = structlog.getLogger(__name__)

# From NIH CADR List
BLOCKED_TLDS = ["cn", "hk", "mo", "ru", "ir", "kp", "cu", "ve"]
COUNTRY_DOMAIN_PATTERN = re.compile(
    r'@(?:[A-Za-z0-9-]+\.)+(?:' + "|".join(BLOCKED_TLDS) + r')$',
    re.IGNORECASE
)


def includeme(config):
    config.add_route('create-unauthorized-user', '/create-unauthorized-user')
    config.scan(__name__)


def get_basic_properties_for_user(request, userid):
    """ Adapted for SMaHT to include attribution related fields """
    user = request.registry[COLLECTIONS]['user'][userid]
    user_dict = user.__json__(request)

    # Only include certain/applicable fields from profile
    include_detail_fields = ['email', 'first_name', 'last_name', 'groups', 'status', 'timezone',
                             'consortia', 'submission_centers', 'submits_for']
    user_actions = calculate_properties(user, request, category='user_action')

    properties = {
        'details': {p: v for p, v in user_dict.items() if p in include_detail_fields},
        'user_actions': [v for k, v in sorted(user_actions.items(), key=itemgetter(0))]
    }

    # add uuid to user details
    properties['details']['uuid'] = userid

    return properties


@view_config(route_name='session-properties', request_method='GET',
             permission=NO_PERMISSION_REQUIRED)
@debug_log
def session_properties(context, request):
    """ Overridden from snovault to include extra information """
    ignored(context)
    for principal in request.effective_principals:
        if principal.startswith('userid.'):
            break
    else:
        # NOTE: returning details below allows internal remoteuser (TEST for example) to run DELETE requests
        # previously in downstream portal applications, the LoginDenied error was raised, preventing such
        # DELETE requests from occurring within unit testing. This can be re-enabled if desired in downstream
        # applications, but for now should stay like this so we can unit test DELETEs - Will April 6 2023
        if 'group.admin' in request.effective_principals:
            return {
                'details': {
                    'groups': [
                        'admin'
                    ]
                }
            }
        else:
            raise LoginDenied(domain=request.domain)

    namespace, userid = principal.split('.', 1)
    properties = get_basic_properties_for_user(request, userid)
    email = properties.get('details', {}).get('email')
    email_is_not_restricted(request.registry, None, email)
    return properties


class SMAHTNamespacedAuthenticationPolicy(NamespacedAuthenticationPolicy):
    pass


class SMAHTBasicAuthAuthenticationPolicy(BasicAuthAuthenticationPolicy):
    pass


_fake_user = object()


def email_matches_blocked_country(email: str) -> bool:
    """
    Returns True if the email domain ends with one of the blocked TLDs.
    """
    if not email:
        return False

    email = email.strip().lower()
    return bool(COUNTRY_DOMAIN_PATTERN.search(email))


def email_is_not_restricted(registry, jwt_info, email=None):
    """ Raises HTTPForbidden if email address is restricted, no-op otherwise """
    restricted_domains = registry['RESTRICTED_DOMAINS']
    restricted_emails = registry['RESTRICTED_EMAILS']
    if email is None:  # if no email passed, check jwt
        if jwt_info is not None:
            email = jwt_info['email'].lower()
        else:
            raise HTTPForbidden(title="Cannot determine email address - jwt_info is None and no email arg")
    # An address we cannot split into exactly one local part and one domain cannot be evaluated
    # against the restricted domain/email lists, so it is refused rather than allowed through.
    # Previously this raised IndexError (surfacing as an HTTP 500) for any value lacking an '@'.
    email_parts = email.split('@')
    if len(email_parts) != 2 or not all(email_parts):
        raise HTTPForbidden(title=f"Cannot determine email domain from {email}")
    email_domain = email_parts[1]
    if (email_matches_blocked_country(email) or
            email in restricted_emails or email_domain in restricted_emails or
            email_domain in restricted_domains):
        raise HTTPForbidden(
            title=f"Email address {email} restricted due to NIH CADR Security Guidelines",
        )


class SMAHTAuth0AuthenticationPolicy(Auth0AuthenticationPolicy):
    """Adds Okta ID-token verification and the restricted-email check.

    Two token families reach this policy and they are kept strictly apart by
    the token's own `alg` header:

    * Asymmetric (RS256) tokens are Okta ID tokens from the SPA's Authorization
      Code + PKCE login. They are verified against the configured issuer's JWKS,
      audience and claims by ``encoded.okta.decode_okta_id_token``.
    * Symmetric (HS256) tokens are the legacy Auth0/RAS tokens and the tokens
      snovault mints for user impersonation, signed with ``auth0.secret``. They
      keep snovault's existing verification untouched.

    Because the Okta path pins its accepted algorithm set to RS256 and the
    legacy path keeps snovault's shared-secret key, neither family can be
    verified by the other's rules - an "alg confusion" downgrade has nowhere to
    land.
    """

    @staticmethod
    def get_token_info(token, request):
        """ Verify Okta-issued ID tokens via JWKS; defer to snovault otherwise.

            Overrides `Auth0AuthenticationPolicy.get_token_info`, which is invoked
            as `self.get_token_info(...)` by snovault and so dispatches here.
        """
        if not token_is_asymmetrically_signed(token):
            return Auth0AuthenticationPolicy.get_token_info(token, request)

        if not okta_is_configured(request.registry.settings):
            # An asymmetrically signed token cannot be checked without an issuer
            # to check it against. Refuse rather than fall through to a
            # shared-secret decode that would treat the key as opaque bytes.
            log.warning("Received an asymmetrically signed token but Okta is not configured")
            request.set_property(lambda r: True, 'auth0_expired')
            return None

        try:
            payload = decode_okta_id_token(token, request.registry)
        except jwt_exceptions.ExpiredSignatureError:
            # Normal/expected expiration - lets renderers unset the cookie.
            request.set_property(lambda r: True, 'auth0_expired')
            return None
        # PyJWTError is the base for every rejection reason worth catching here,
        # including InvalidKeyError and PyJWKClientError - neither of which is a
        # subclass of InvalidTokenError, so a narrower catch would surface a 500.
        except (jwt_exceptions.PyJWTError, OktaConfigurationError,
                requests.RequestException, ValueError) as e:
            log.warning("Rejected Okta ID token", error=str(e))
            request.set_property(lambda r: True, 'auth0_expired')
            return None

        request.set_property(lambda r: False, 'auth0_expired')
        return payload

    def unauthenticated_userid(self, request):
        """ Override the login to additionally include restricted user checks """

        # we will cache it for the life of this request, cause pyramids does traversal
        cached = getattr(request, '_auth0_authenticated', _fake_user)

        if cached is not _fake_user:
            return cached

        # try to find the token in the request (should be in the header)
        id_token = get_jwt(request)
        if not id_token:
            # can I thrown an 403 here?
            # print('Missing assertion.', 'unauthenticated_userid', request)
            return None

        jwt_info = self.get_token_info(id_token, request)
        if not jwt_info:
            return None

        # Check email against domains
        email_is_not_restricted(request.registry, jwt_info)

        # duplicates a small amount of effort but not meaningfully
        return super().unauthenticated_userid(request)



def smaht_basic_auth_check(username, password, request):
    """ No restricted email check here necessary since we are overriding at login """
    return basic_auth_check(username, password, request)



@view_config(route_name='create-unauthorized-user', request_method='POST',
             permission=NO_PERMISSION_REQUIRED)
@debug_log
def smaht_create_unauthorized_user(context, request):
    """ Override for the registration route that includes restricted email checks and
        strips privileged fields (e.g. groups, status) from the submitted user props
    """
    ignored(context)
    # env check
    env_name = request.registry.settings.get('env.name')
    if not app_project().env_allows_auto_registration(env_name):
        raise LoginDenied(f'Tried to register on {env_name} but it is disallowed')

    recaptcha_resp = request.json.get('g-recaptcha-response')
    if not recaptcha_resp:
        raise LoginDenied(f'Did not receive response from recaptcha!')

    registry = request.registry

    presented_token = get_jwt(request)
    if (presented_token and token_is_asymmetrically_signed(presented_token)
            and okta_is_configured(registry.settings)):
        # Okta SPA self-registration. The browser has already POSTed this Okta ID
        # token to /login, so it arrives here as the `jwtToken` cookie; verify it
        # directly. The Redis session-token branch below belongs to the
        # confidential Auth0/RAS `/callback` exchange, which the PKCE SPA flow
        # never populates - taking it for an Okta token would fail on a
        # Redis-enabled environment.
        try:
            jwt_info = decode_okta_id_token(presented_token, registry)
        except (jwt_exceptions.PyJWTError, OktaConfigurationError,
                requests.RequestException, ValueError) as e:
            log.warning("Rejected Okta ID token during self-registration", error=str(e))
            raise HTTPUnauthorized(
                title="Could not validate your Okta login. Try logging in again.",
                headers={
                    'WWW-Authenticate':
                        "Bearer realm=\"{}\"; Basic realm=\"{}\"".format(request.domain, request.domain)}
            )
        email = jwt_info['email'].lower()

    # old method for retrieving auth'd email - request object should have _auth0_authenticated set
    # NOTE: it is not obvious to me how this works... probably should be looked into - Will March 29 2023
    elif not redis_is_active(request):
        email = "<no auth0 authenticated e-mail supplied>"
        if hasattr(request, "_auth0_authenticated"):
            email = request._auth0_authenticated  # equal to: jwt_info['email'].lower()

    # new method for retrieving auth'd email - request should have transmitted a session token
    # from which we can get the JWT and the email they auth'd with
    else:
        id_token = get_jwt(request)
        redis_handler = registry[REDIS]
        env_name = registry.settings['env.name']
        auth0_domain = request.registry.settings['auth0.domain']
        if 'auth0' in auth0_domain:
            secret = request.registry.settings['auth0.secret']
            algorithms = JWT_DECODING_ALGORITHMS
        else:
            # RAS
            secret = request.registry.settings['auth0.public.key']
            algorithms = ['RS256']

        redis_session_token = RedisSessionToken.from_redis(
            redis_handler=redis_handler,
            namespace=env_name,
            token=id_token
        )
        jwt_info = redis_session_token.decode_jwt(
            audience=request.registry.settings['auth0.client'],
            secret=secret,
            algorithms=algorithms
        )
        if jwt_info.get('email') is None:
            jwt_info['email'] = redis_session_token.get_email()
        email = jwt_info.get('email', '<no e-mail supplied>').lower()

    user_props = request.json
    user_props_email = user_props.get("email", "<no e-mail supplied>").lower()
    # This check must come first: when no Auth0 email could be established above, `email` is a
    # placeholder string (e.g. "<no auth0 authenticated e-mail supplied>") that this comparison
    # is designed to reject with a 401. Running the restriction check ahead of it fed that
    # placeholder to email_is_not_restricted instead. Once this passes, email == user_props_email,
    # so the restriction check below evaluates exactly the same address either way.
    if user_props_email != email:
        raise HTTPUnauthorized(
            title="Provided email {} not validated with Auth0. Try logging in again.".format(user_props_email),
            headers={
                'WWW-Authenticate': "Bearer realm=\"{}\"; Basic realm=\"{}\"".format(request.domain, request.domain)}
        )
    email_is_not_restricted(request.registry, None, email)

    # set user insert props
    del user_props['g-recaptcha-response']
    # Self-registration must never let the caller grant themselves elevated access or
    # false affiliations. request.remote_user is set to 'EMBED' below, which (intentionally,
    # for other internal purposes) carries the 'restricted_fields' permission - so without this,
    # a caller could pass e.g. "groups": ["admin"] in this request body and have it applied as-is.
    for privileged_field in ('groups', 'submission_centers', 'consortia', 'submits_for', 'status', 'uuid'):
        user_props.pop(privileged_field, None)
    user_props['was_unauthorized'] = True
    user_props['email'] = user_props_email  # lower-cased
    user_coll = request.registry[COLLECTIONS]['User']
    request.remote_user = 'EMBED'  # permission = restricted_fields

    # validate the User json
    validate_request(user_coll.type_info.schema, request, user_props)
    if request.errors:
        raise ValidationFailure('body', 'create_unauthorized_user', 'Cannot validate request')

    # validate recaptcha_resp
    # https://developers.google.com/recaptcha/docs/verify
    recap_url = 'https://www.google.com/recaptcha/api/siteverify'
    recap_secret = request.registry.settings['g.recaptcha.secret']
    recap_values = {
        'secret': recap_secret,
        'response': recaptcha_resp
    }
    data = urlencode(recap_values).encode()
    headers = {"Content-Type": "application/x-www-form-urlencoded; charset=utf-8"}
    recap_res = requests.get(recap_url, params=data, headers=headers).json()

    if recap_res['success']:
        sno_res = sno_collection_add(user_coll, request, False)  # POST User
        if sno_res.get('status') == 'success':
            log.warning(
                "User account created",
                event_type="user_account",
                action="user_account_create",
                outcome="success",
                **authenticated_actor_fields(request),
                **subject_uuid_fields(result_subject_uuid(sno_res)),
            )
            return sno_res
        else:
            raise HTTPForbidden(title="Could not create user. Try logging in again.")
    else:
        # error with re-captcha
        raise HTTPUnauthorized(
            title="Invalid reCAPTCHA. Try logging in again.",
            headers={
                'WWW-Authenticate':
                    "Bearer realm=\"{}\"; Basic realm=\"{}\"".format(request.domain, request.domain)}
        )
