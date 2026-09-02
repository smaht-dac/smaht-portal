import io
import json
import logging
import pytest
import unittest

from unittest.mock import MagicMock, PropertyMock, patch

from pyramid.interfaces import IAuthenticationPolicy
from pyramid.security import Authenticated, Everyone
from pyramid.testing import DummyRequest
from pyramid.threadlocal import manager
from pyramid.httpexceptions import HTTPForbidden, HTTPUnauthorized
from snovault import COLLECTIONS
from snovault.authentication import (
    Auth0AuthenticationPolicy as SnovaultAuth0AuthenticationPolicy,
)
from snovault.project.authentication import SnovaultProjectAuthentication
from zope.interface.verify import verifyClass, verifyObject
from ..authentication import (
    NamespacedAuthenticationPolicy, email_is_not_restricted, smaht_create_unauthorized_user
)
from ..logging_config import _configure_structlog, make_console_formatter
from ..project.authentication import SMAHTProjectAuthentication


pytestmark = [pytest.mark.setone, pytest.mark.working]


class TestNamespacedAuthenticationPolicy(unittest.TestCase):
    """ This is a modified version of TestRemoteUserAuthenticationPolicy
    """
    def _getTargetClass(self):
        return NamespacedAuthenticationPolicy

    def _makeOne(self, namespace='user',
                base='pyramid.authentication.RemoteUserAuthenticationPolicy',
                *args, **kw):
        return self._getTargetClass()(namespace, base, *args, **kw)

    def test_class_implements_IAuthenticationPolicy(self):
        klass = self._makeOne().__class__
        verifyClass(IAuthenticationPolicy, klass)

    def test_instance_implements_IAuthenticationPolicy(self):
        verifyObject(IAuthenticationPolicy, self._makeOne())

    def test_unauthenticated_userid_returns_None(self):
        request = DummyRequest(environ={})
        policy = self._makeOne()
        self.assertEqual(policy.unauthenticated_userid(request), None)

    def test_unauthenticated_userid(self):
        request = DummyRequest(environ={'REMOTE_USER':'fred'})
        policy = self._makeOne()
        self.assertEqual(policy.unauthenticated_userid(request), 'user.fred')

    def test_authenticated_userid_None(self):
        request = DummyRequest(environ={})
        policy = self._makeOne()
        self.assertEqual(policy.authenticated_userid(request), None)

    def test_authenticated_userid(self):
        request = DummyRequest(environ={'REMOTE_USER':'fred'})
        policy = self._makeOne()
        self.assertEqual(policy.authenticated_userid(request), 'user.fred')

    def test_effective_principals_None(self):
        request = DummyRequest(environ={})
        policy = self._makeOne()
        self.assertEqual(policy.effective_principals(request), [Everyone])

    def test_effective_principals(self):
        request = DummyRequest(environ={'REMOTE_USER':'fred'})
        policy = self._makeOne()
        self.assertEqual(policy.effective_principals(request),
                         [Everyone, Authenticated, 'user.fred'])

    def test_remember(self):
        request = DummyRequest(environ={'REMOTE_USER':'fred'})
        policy = self._makeOne()
        result = policy.remember(request, 'fred')
        self.assertEqual(result, [])

    def test_forget(self):
        request = DummyRequest(environ={'REMOTE_USER':'fred'})
        policy = self._makeOne()
        result = policy.forget(request)
        self.assertEqual(result, [])

    # From TestSessionAuthenticationPolicy

    def test_session_remember(self):
        request = DummyRequest()
        policy = self._makeOne(
                    base='pyramid.authentication.SessionAuthenticationPolicy',
                    prefix='')
        result = policy.remember(request, 'user.fred')
        self.assertEqual(request.session.get('userid'), 'fred')
        self.assertEqual(result, [])
        self.assertEqual(policy.unauthenticated_userid(request), 'user.fred')

    def test_session_forget(self):
        request = DummyRequest(session={'userid':'fred'})
        policy = self._makeOne(
                    base='pyramid.authentication.SessionAuthenticationPolicy',
                    prefix='')
        result = policy.forget(request)
        self.assertEqual(request.session.get('userid'), None)
        self.assertEqual(result, [])

    def test_session_forget_no_identity(self):
        request = DummyRequest()
        policy = self._makeOne(
                    base='pyramid.authentication.SessionAuthenticationPolicy',
                    prefix='')
        result = policy.forget(request)
        self.assertEqual(request.session.get('userid'), None)
        self.assertEqual(result, [])


def test_login_emits_actor_uuid_structured_audit_event():
    """A successful login includes only the canonical actor UUID."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(make_console_formatter())
    encoded_logger = logging.getLogger("encoded")
    auth_logger = logging.getLogger("encoded.project.authentication")
    previous_encoded = (list(encoded_logger.handlers), encoded_logger.level, encoded_logger.propagate)
    previous_auth = (list(auth_logger.handlers), auth_logger.level, auth_logger.propagate)
    encoded_logger.handlers[:] = [handler]
    encoded_logger.setLevel(logging.WARNING)
    encoded_logger.propagate = False
    auth_logger.handlers[:] = []
    auth_logger.setLevel(logging.NOTSET)
    auth_logger.propagate = True
    try:
        _configure_structlog(in_prod=True)
        request = DummyRequest(headers={'Authorization': 'Bearer synthetic-login-token'})
        request.scheme = 'http'
        with patch.object(
            type(request),
            'effective_principals',
            new_callable=PropertyMock,
            return_value=['userid.00000000-0000-4000-8000-000000000001'],
        ):
            result = SMAHTProjectAuthentication().login(None, request, samesite='strict')
    finally:
        encoded_logger.handlers[:] = previous_encoded[0]
        encoded_logger.setLevel(previous_encoded[1])
        encoded_logger.propagate = previous_encoded[2]
        auth_logger.handlers[:] = previous_auth[0]
        auth_logger.setLevel(previous_auth[1])
        auth_logger.propagate = previous_auth[2]
        handler.close()

    record = json.loads(stream.getvalue())
    assert result == {'saved_cookie': True}
    assert record['logger'] == 'encoded.project.authentication'
    assert record['message'] == 'User login successful'
    assert record['event_type'] == 'user_login'
    assert record['action'] == 'login'
    assert record['outcome'] == 'success'
    assert record['user_uuid'] == '00000000-0000-4000-8000-000000000001'
    assert 'synthetic-login-token' not in stream.getvalue()
    assert 'synthetic-login@example.invalid' not in stream.getvalue()


def test_login_failure_emits_identity_free_structured_audit_event():
    """A login processing failure reaches the same configured log path."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(make_console_formatter())
    encoded_logger = logging.getLogger("encoded")
    auth_logger = logging.getLogger("encoded.project.authentication")
    previous_encoded = (list(encoded_logger.handlers), encoded_logger.level, encoded_logger.propagate)
    previous_auth = (list(auth_logger.handlers), auth_logger.level, auth_logger.propagate)
    encoded_logger.handlers[:] = [handler]
    encoded_logger.setLevel(logging.WARNING)
    encoded_logger.propagate = False
    auth_logger.handlers[:] = []
    auth_logger.setLevel(logging.NOTSET)
    auth_logger.propagate = True
    try:
        _configure_structlog(in_prod=True)
        request = DummyRequest(headers={'Authorization': 'Bearer synthetic-login-token'})
        with patch.object(SnovaultProjectAuthentication, 'login', side_effect=ValueError('synthetic failure')):
            with pytest.raises(ValueError, match='synthetic failure'):
                SMAHTProjectAuthentication().login(None, request, samesite='strict')
    finally:
        encoded_logger.handlers[:] = previous_encoded[0]
        encoded_logger.setLevel(previous_encoded[1])
        encoded_logger.propagate = previous_encoded[2]
        auth_logger.handlers[:] = previous_auth[0]
        auth_logger.setLevel(previous_auth[1])
        auth_logger.propagate = previous_auth[2]
        handler.close()

    record = json.loads(stream.getvalue())
    assert record['logger'] == 'encoded.project.authentication'
    assert record['message'] == 'User login failed'
    assert record['event_type'] == 'user_login'
    assert record['action'] == 'login'
    assert record['outcome'] == 'failure'
    assert 'user_uuid' not in record
    assert 'synthetic-login-token' not in stream.getvalue()
    assert 'synthetic-login@example.invalid' not in stream.getvalue()


@pytest.mark.parametrize('email', [
    'bsmepublic@163.com',  # explicitly listed email
    'test@gsu.edu',  # wildcard pattern from email list
    'person@gmail.com',  # common free email
    'person@org.cn',  # general restricted email location
    'person2@complex.org.ru'  # more restricted location
])
def test_restricted_emails(testapp, email):
    """ Unit tests for the helper function that does email verification """
    with pytest.raises(HTTPForbidden):
        email_is_not_restricted(testapp.app.registry, None, email)
        email_is_not_restricted(testapp.app.registry, {
            'email': email
        })


# email_is_not_restricted only reads these two keys off the registry, so a plain dict is
# sufficient (this is exactly how encoded.commands.prune_restricted_users calls it) and lets
# these cases run without the server fixture stack.
EMPTY_RESTRICTION_REGISTRY = {
    'RESTRICTED_DOMAINS': set(),
    'RESTRICTED_EMAILS': set(),
}


@pytest.mark.parametrize('email', [
    'user@dept.example.org',  # multi-label domain, not restricted
    'person@example.org',
])
def test_unrestricted_emails_are_allowed(email):
    """ Valid, unrestricted addresses must pass through the check without raising. """
    email_is_not_restricted(EMPTY_RESTRICTION_REGISTRY, None, email)


@pytest.mark.parametrize('email', [
    '',  # empty string
    '<no auth0 authenticated e-mail supplied>',  # placeholder used when Auth0 login is absent
    '<no e-mail supplied>',  # placeholder used when no email is on the JWT
    'nodomain',  # no '@' at all
    'user@',  # no domain part
    '@example.com',  # no local part
    'user@one@two.com',  # ambiguous domain
])
def test_unparseable_emails_are_forbidden_not_500(email):
    """ Regression: any value whose domain cannot be determined must be refused via the
        established HTTPForbidden contract rather than raising IndexError (an HTTP 500).
    """
    with pytest.raises(HTTPForbidden):
        email_is_not_restricted(EMPTY_RESTRICTION_REGISTRY, None, email)


def test_restricted_email_still_forbidden_without_fixtures():
    """ The restriction semantics themselves are unchanged by the parsing hardening. """
    registry = {
        'RESTRICTED_DOMAINS': {'restricted.org'},
        'RESTRICTED_EMAILS': {'blocked@example.com'},
    }
    email_is_not_restricted(registry, None, 'fine@example.com')
    for restricted in ['blocked@example.com', 'anyone@restricted.org', 'person@org.cn']:
        with pytest.raises(HTTPForbidden):
            email_is_not_restricted(registry, None, restricted)


ATTACKER_EMAIL = 'attacker-self-registration@example.com'


@patch('encoded.authentication.requests.get')
def test_create_unauthorized_user_cannot_self_grant_privileges(mock_recaptcha, dummy_request, testapp):
    """ Regression test for a privilege-escalation vulnerability in the self-registration
        endpoint (POST /create-unauthorized-user, smaht_create_unauthorized_user): the handler
        used to pass the caller's JSON body into User creation almost verbatim while running
        with an internal remote_user ('EMBED') that carries the 'restricted_fields' permission,
        which let a self-registering caller set groups/submission_centers/consortia/submits_for
        (e.g. "groups": ["admin"]) on their own new account. The fix strips those fields from
        the request body before validation, regardless of what the caller submits.

        This creates two real SubmissionCenter/Consortium items via the admin `testapp` and
        attempts to have the attacker's own registration request self-assign membership in
        them (via submission_centers/consortia/submits_for) in addition to "groups": ["admin"],
        then asserts none of it was applied to the resulting User item.
    """
    mock_recaptcha.return_value = MagicMock(json=lambda: {'success': True})

    submission_center = testapp.post_json('/submission-centers/', {
        'identifier': 'regression_test_sc', 'code': 'rtsc', 'title': 'Regression Test SC',
    }, status=201).json
    consortium = testapp.post_json('/consortia/', {
        'identifier': 'regression_test_con', 'title': 'Regression Test Consortium',
    }, status=201).json
    submission_center_uuid = submission_center['@graph'][0]['uuid']
    consortium_uuid = consortium['@graph'][0]['uuid']

    dummy_request.json = {
        'g-recaptcha-response': 'fake-recaptcha-token',
        'email': ATTACKER_EMAIL,
        'first_name': 'Attacker',
        'last_name': 'McAttackerson',
        'groups': ['admin'],
        'submission_centers': [submission_center_uuid],
        'consortia': [consortium_uuid],
        'submits_for': [submission_center_uuid],
    }
    # Simulates a real, properly-authenticated Auth0 login for this email (the normal
    # mechanism the endpoint relies on to trust the submitted email address).
    dummy_request._auth0_authenticated = ATTACKER_EMAIL
    # Needed so the schema's field-level `permission` validator (restricted_fields) can
    # resolve request.has_permission(...) the same way it would for a real HTTP request.
    dummy_request.context = dummy_request.root

    # smaht_create_unauthorized_user relies on pyramid's current-request threadlocal (e.g. for
    # server-default calculated properties); calling it directly requires pushing that context.
    manager.push({'request': dummy_request, 'registry': dummy_request.registry})
    try:
        smaht_create_unauthorized_user(None, dummy_request)
    finally:
        manager.pop()

    new_user = dummy_request.registry[COLLECTIONS]['User'][ATTACKER_EMAIL]
    assert new_user.properties.get('groups', []) == []
    assert new_user.properties.get('submission_centers', []) == []
    assert new_user.properties.get('consortia', []) == []
    assert new_user.properties.get('submits_for', []) == []
    assert new_user.properties.get('was_unauthorized') is True
    assert new_user.properties.get('email') == ATTACKER_EMAIL


REPORTED_EMAIL = 'user@dept.example.org'


@patch('encoded.authentication.redis_is_active', return_value=False)
@patch('encoded.authentication.app_project')
def test_create_unauthorized_user_without_auth0_email_is_401_not_500(mock_app_project, mock_redis_active):
    """ Regression test for an HTTP 500 (IndexError: list index out of range) on
        POST /create-unauthorized-user.

        When no Auth0 email can be established for the request, the handler falls back to the
        placeholder string "<no auth0 authenticated e-mail supplied>". That placeholder is meant
        to be rejected by the `user_props_email != email` comparison with a 401, but the
        restricted-email check ran ahead of that comparison and tried `placeholder.split('@')[1]`,
        raising IndexError. The submitted address itself is perfectly valid and never reaches the
        crash, which is why a report like this one looks like an address-parsing problem.

        This case stops well before any database write, so it is mocked rather than
        fixture-backed and runs without the server fixture stack.
    """
    mock_app_project.return_value.env_allows_auto_registration.return_value = True
    request = MagicMock()
    request.json = {
        'g-recaptcha-response': 'fake-recaptcha-token',
        'email': REPORTED_EMAIL,
        'first_name': 'Jane',
        'last_name': 'Doe',
    }
    # A MagicMock answers hasattr() for anything, so the attribute is explicitly removed to
    # reproduce the request shape that produced the 500: no Auth0-authenticated email.
    del request._auth0_authenticated
    assert not hasattr(request, '_auth0_authenticated')

    with pytest.raises(HTTPUnauthorized):
        smaht_create_unauthorized_user(None, request)


@patch('encoded.authentication.requests.get')
def test_create_unauthorized_user_accepts_multi_label_domain(mock_recaptcha, dummy_request):
    """ The reported (valid, unrestricted) address must reach the normal registration flow. """
    mock_recaptcha.return_value = MagicMock(json=lambda: {'success': True})

    dummy_request.json = {
        'g-recaptcha-response': 'fake-recaptcha-token',
        'email': REPORTED_EMAIL,
        'first_name': 'Jane',
        'last_name': 'Doe',
    }
    dummy_request._auth0_authenticated = REPORTED_EMAIL
    dummy_request.context = dummy_request.root

    manager.push({'request': dummy_request, 'registry': dummy_request.registry})
    try:
        smaht_create_unauthorized_user(None, dummy_request)
    finally:
        manager.pop()

    new_user = dummy_request.registry[COLLECTIONS]['User'][REPORTED_EMAIL]
    assert new_user.properties.get('email') == REPORTED_EMAIL
    assert new_user.properties.get('was_unauthorized') is True


# ---------------------------------------------------------------------------
# SMAHTAuth0AuthenticationPolicy token routing.
#
# Two token families reach the policy and must stay strictly apart: Okta ID
# tokens (RS256, verified against the issuer's JWKS) and the legacy
# Auth0/impersonation tokens (HS256, verified with `auth0.secret`). These tests
# are fixture-free - an RSA keypair is generated in-process and the JWKS lookup
# is stubbed - so they exercise the real routing decision, not a mock of it.
# ---------------------------------------------------------------------------

import datetime as _datetime

import jwt as _jwt
import requests
from cryptography.hazmat.primitives.asymmetric import rsa as _rsa

from ..authentication import SMAHTAuth0AuthenticationPolicy


_OKTA_ISSUER = "https://example.okta.com/oauth2/default"
_OKTA_CLIENT = "0oa1example2client3id"
_LEGACY_SECRET = "legacy-shared-secret-long-enough-for-hs256"


def _policy_request(settings):
    """A minimal request whose registry carries `settings` and records properties."""
    class Registry(dict):
        def __init__(self, settings):
            super().__init__()
            self.settings = settings

    request = MagicMock()
    request.registry = Registry(settings)
    request.domain = "portal.example.org"
    request.set_property = MagicMock()
    return request


def _okta_settings(**overrides):
    settings = {
        "okta.issuer": _OKTA_ISSUER,
        "okta.client": _OKTA_CLIENT,
        "okta.scopes": "openid email profile",
        "okta.jwks_uri": f"{_OKTA_ISSUER}/v1/keys",
        "okta.require_email_verified": True,
        "auth0.client": _OKTA_CLIENT,
        "auth0.secret": _LEGACY_SECRET,
    }
    settings.update(overrides)
    return settings


def _rs256_token(key, **claim_overrides):
    now = _datetime.datetime.now(_datetime.timezone.utc)
    claims = {
        "iss": _OKTA_ISSUER,
        "aud": _OKTA_CLIENT,
        "sub": "00uexamplesubject",
        "email": "someone@example.org",
        "email_verified": True,
        "iat": int(now.timestamp()),
        "exp": int((now + _datetime.timedelta(minutes=10)).timestamp()),
    }
    claims.update(claim_overrides)
    return _jwt.encode(claims, key, algorithm="RS256", headers={"kid": "k1"})


def _hs256_token(secret=_LEGACY_SECRET, **claim_overrides):
    """Shaped like the token snovault mints for user impersonation."""
    claims = {"email": "admin@example.org", "email_verified": True, "aud": _OKTA_CLIENT}
    claims.update(claim_overrides)
    return _jwt.encode(claims, secret, algorithm="HS256")


def _stubbed_jwks(key):
    signing_key = MagicMock()
    signing_key.key = key.public_key()
    jwks_client = MagicMock()
    jwks_client.get_signing_key_from_jwt.return_value = signing_key
    return jwks_client


@pytest.fixture(scope="module")
def policy_rsa_key():
    return _rsa.generate_private_key(public_exponent=65537, key_size=2048)


def test_okta_rs256_token_is_verified_and_accepted(policy_rsa_key):
    request = _policy_request(_okta_settings())
    token = _rs256_token(policy_rsa_key)
    with patch("encoded.okta.get_okta_jwks_client",
               return_value=_stubbed_jwks(policy_rsa_key)):
        payload = SMAHTAuth0AuthenticationPolicy.get_token_info(token, request)
    assert payload["email"] == "someone@example.org"
    assert payload["iss"] == _OKTA_ISSUER


def test_okta_token_from_a_foreign_issuer_is_rejected(policy_rsa_key):
    request = _policy_request(_okta_settings())
    token = _rs256_token(policy_rsa_key, iss="https://attacker.example.com")
    with patch("encoded.okta.get_okta_jwks_client",
               return_value=_stubbed_jwks(policy_rsa_key)):
        assert SMAHTAuth0AuthenticationPolicy.get_token_info(token, request) is None


def test_okta_token_for_a_foreign_audience_is_rejected(policy_rsa_key):
    request = _policy_request(_okta_settings())
    token = _rs256_token(policy_rsa_key, aud="some-other-client")
    with patch("encoded.okta.get_okta_jwks_client",
               return_value=_stubbed_jwks(policy_rsa_key)):
        assert SMAHTAuth0AuthenticationPolicy.get_token_info(token, request) is None


def test_expired_okta_token_marks_the_request_expired(policy_rsa_key):
    """`auth0_expired` is what lets the renderers unset the stale cookie."""
    now = _datetime.datetime.now(_datetime.timezone.utc)
    request = _policy_request(_okta_settings())
    token = _rs256_token(
        policy_rsa_key,
        iat=int((now - _datetime.timedelta(hours=2)).timestamp()),
        exp=int((now - _datetime.timedelta(hours=1)).timestamp()),
    )
    with patch("encoded.okta.get_okta_jwks_client",
               return_value=_stubbed_jwks(policy_rsa_key)):
        assert SMAHTAuth0AuthenticationPolicy.get_token_info(token, request) is None
    assert request.set_property.called


def test_asymmetric_token_is_refused_when_okta_is_not_configured(policy_rsa_key):
    """Without an issuer there is nothing to verify against, so refuse."""
    request = _policy_request({"auth0.client": _OKTA_CLIENT, "auth0.secret": _LEGACY_SECRET})
    token = _rs256_token(policy_rsa_key)
    assert SMAHTAuth0AuthenticationPolicy.get_token_info(token, request) is None


def test_legacy_hs256_token_still_uses_snovaults_verification():
    """Impersonation tokens are HS256 and must keep working unchanged."""
    request = _policy_request(_okta_settings())
    token = _hs256_token()
    with patch.object(SnovaultAuth0AuthenticationPolicy, "get_token_info",
                      return_value={"email": "admin@example.org"}) as legacy:
        payload = SMAHTAuth0AuthenticationPolicy.get_token_info(token, request)
    legacy.assert_called_once_with(token, request)
    assert payload == {"email": "admin@example.org"}


def test_hs256_token_cannot_be_verified_on_the_okta_path(policy_rsa_key):
    """Algorithm confusion: an HS256 token never reaches the JWKS verification."""
    request = _policy_request(_okta_settings())
    token = _hs256_token()
    with patch("encoded.okta.decode_okta_id_token") as okta_decode:
        with patch.object(SnovaultAuth0AuthenticationPolicy, "get_token_info",
                          return_value=None):
            SMAHTAuth0AuthenticationPolicy.get_token_info(token, request)
    okta_decode.assert_not_called()


@pytest.mark.parametrize("token", ["", "garbage", "a.b"])
def test_malformed_tokens_fall_through_to_the_legacy_path(token):
    request = _policy_request(_okta_settings())
    with patch.object(SnovaultAuth0AuthenticationPolicy, "get_token_info",
                      return_value=None) as legacy:
        assert SMAHTAuth0AuthenticationPolicy.get_token_info(token, request) is None
    legacy.assert_called_once_with(token, request)


def test_jwks_lookup_failure_is_a_rejection_not_a_500(policy_rsa_key):
    """`InvalidKeyError`/`PyJWKClientError` are not `InvalidTokenError` subclasses."""
    request = _policy_request(_okta_settings())
    token = _rs256_token(policy_rsa_key)
    failing_client = MagicMock()
    failing_client.get_signing_key_from_jwt.side_effect = (
        _jwt.exceptions.PyJWKClientConnectionError("JWKS unreachable")
    )
    with patch("encoded.okta.get_okta_jwks_client", return_value=failing_client):
        assert SMAHTAuth0AuthenticationPolicy.get_token_info(token, request) is None


def test_unusable_signing_key_is_a_rejection_not_a_500(policy_rsa_key):
    request = _policy_request(_okta_settings())
    token = _rs256_token(policy_rsa_key)
    bad_key = MagicMock()
    bad_key.key = "not-a-public-key"
    jwks_client = MagicMock()
    jwks_client.get_signing_key_from_jwt.return_value = bad_key
    with patch("encoded.okta.get_okta_jwks_client", return_value=jwks_client):
        assert SMAHTAuth0AuthenticationPolicy.get_token_info(token, request) is None


def test_okta_discovery_failure_is_a_rejection_not_a_500(policy_rsa_key):
    settings = _okta_settings()
    settings.pop("okta.jwks_uri")
    request = _policy_request(settings)
    token = _rs256_token(policy_rsa_key)
    with patch("encoded.okta.requests.get", side_effect=requests.ConnectionError("down")):
        assert SMAHTAuth0AuthenticationPolicy.get_token_info(token, request) is None
