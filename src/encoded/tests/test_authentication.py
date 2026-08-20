import io
import json
import logging
import pytest
import unittest

from unittest.mock import MagicMock, patch

from pyramid.interfaces import IAuthenticationPolicy
from pyramid.security import Authenticated, Everyone
from pyramid.testing import DummyRequest
from pyramid.threadlocal import manager
from pyramid.httpexceptions import HTTPForbidden, HTTPUnauthorized
from snovault import COLLECTIONS
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


def test_login_emits_identity_free_structured_audit_event():
    """A successful login request is visible on the configured encoded log path."""
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
