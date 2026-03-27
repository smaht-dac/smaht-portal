from snovault.authentication import (
    NamespacedAuthenticationPolicy,
    BasicAuthAuthenticationPolicy,
    basic_auth_check,
    Auth0AuthenticationPolicy,
    LoginDenied,
    get_jwt
)
from snovault import COLLECTIONS
from snovault.calculated import calculate_properties
from operator import itemgetter
from dcicutils.misc_utils import ignored
from pyramid.security import NO_PERMISSION_REQUIRED
from pyramid.view import view_config
from snovault.util import debug_log
from pyramid.httpexceptions import HTTPForbidden
import re

# From NIH CADR List
BLOCKED_TLDS = ["cn", "hk", "mo", "ru", "ir", "kp", "cu", "ve"]
COUNTRY_DOMAIN_PATTERN = re.compile(
    r'@(?:[A-Za-z0-9-]+\.)+(?:' + "|".join(BLOCKED_TLDS) + r')$',
    re.IGNORECASE
)


def includeme(config):
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
    email_domain = email.split('@')[1]
    if (email_matches_blocked_country(email) or
            email in restricted_emails or email_domain in restricted_emails or
            email_domain in restricted_domains):
            raise HTTPForbidden(
                title=f"Email address {email} restricted due to NIH CADR Security Guidelines",
        )


class SMAHTAuth0AuthenticationPolicy(Auth0AuthenticationPolicy):
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

