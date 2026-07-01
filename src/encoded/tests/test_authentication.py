import pytest
import unittest

from unittest.mock import MagicMock, patch

from pyramid.interfaces import IAuthenticationPolicy
from pyramid.security import Authenticated, Everyone
from pyramid.testing import DummyRequest
from pyramid.threadlocal import manager
from pyramid.httpexceptions import HTTPForbidden
from snovault import COLLECTIONS
from zope.interface.verify import verifyClass, verifyObject
from ..authentication import (
    NamespacedAuthenticationPolicy, email_is_not_restricted, smaht_create_unauthorized_user
)


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