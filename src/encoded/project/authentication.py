import structlog

from pyramid.httpexceptions import HTTPUnauthorized
from pyramid.request import Request
from snovault.authentication import get_jwt_from_auth_header
from snovault.project.authentication import SnovaultProjectAuthentication

from ..audit_logging import (
    AUTH_FAILURE_USER_NOT_FOUND,
    EVENT_TYPE_AUTHENTICATION,
    authenticated_actor_fields,
    auth_failure_reason,
    identity_fields,
    record_audit_event,
)


log = structlog.getLogger(__name__)

# The login view is reached with a credential the application has not checked
# yet, so these describe why a login attempt produced no verified identity.
LOGIN_FAILURE_NO_CREDENTIAL = "no_credential_presented"
LOGIN_FAILURE_COOKIE_NOT_SAVED = "cookie_not_saved"


class SMAHTProjectAuthentication(SnovaultProjectAuthentication):
    def login(self, context, request, *, samesite):
        """Save the JWT cookie, then audit what the credential actually proved.

        Snovault's ``login`` only stores the presented token in a cookie; it
        performs no verification. A login is therefore recorded as a success
        only after the token has been run through the real authentication
        policy and resolved to exactly one portal User. The verification uses a
        blank request carrying only that token, so an unrelated ``jwtToken``
        cookie already on the incoming request can never supply the identity.
        """
        try:
            response = super().login(context, request, samesite=samesite)
        except Exception:
            # Do not include request data here. The token is intentionally not
            # copied into the application log stream.
            record_audit_event(
                request,
                "User login failed",
                EVENT_TYPE_AUTHENTICATION,
                "login",
                "failure",
                reason=LOGIN_FAILURE_COOKIE_NOT_SAVED,
            )
            raise

        identity = {}
        reason = None
        credential_request = None
        try:
            token = get_jwt_from_auth_header(request)
            if token is None:
                token = request.json_body.get("id_token")
            if token:
                credential_request = Request.blank(
                    request.path_url, headers={"Authorization": f"Bearer {token}"}
                )
                credential_request.registry = request.registry
                actor = authenticated_actor_fields(credential_request)
                if actor:
                    identity = identity_fields(
                        credential_request, user_id=actor["user_id"]
                    )
            else:
                reason = LOGIN_FAILURE_NO_CREDENTIAL
        except Exception:
            pass

        if identity:
            record_audit_event(
                request,
                "User login successful",
                EVENT_TYPE_AUTHENTICATION,
                "login",
                "success",
                identity=identity,
            )
            return response

        if reason is None:
            # A token was presented but proved nothing. Prefer the policy's own
            # rejection reason; a token that verified but matched no portal
            # User is a distinct, reportable case.
            reason = auth_failure_reason(credential_request) or AUTH_FAILURE_USER_NOT_FOUND
        record_audit_event(
            request,
            "User login failed",
            EVENT_TYPE_AUTHENTICATION,
            "login",
            "failure",
            identity=identity_fields(credential_request) if credential_request else {},
            reason=reason,
        )
        return response

    def logout(self, context, request):
        """Audit the explicit logout the SPA performs against this endpoint."""
        identity = identity_fields(request)
        response = super().logout(context, request)
        record_audit_event(
            request,
            "User logout",
            EVENT_TYPE_AUTHENTICATION,
            "logout",
            "success",
            identity=identity,
        )
        return response

    def namespaced_authentication_policy_authenticated_userid(self, namespaced_authentication_policy, request,
                                                              set_user_info_property):
        set_user_info_property = True
        return super().namespaced_authentication_policy_authenticated_userid(namespaced_authentication_policy, request,
                                                                             set_user_info_property)

    def note_auth0_authentication_policy_unauthenticated_userid(self, auth0_authentication_policy, request, email,
                                                                id_token):
        # Allow access basic user credentials from request obj after authenticating & saving request
        def get_user_info(request):
            user_props = request.embed('/session-properties',
                                       as_user=email)  # Performs an authentication against DB for user.
            if not user_props.get('details'):
                raise HTTPUnauthorized(
                    title="Could not find user info for {}".format(email),
                    headers={'WWW-Authenticate': "Bearer realm=\"{}\"; Basic realm=\"{}\"".format(request.domain,
                                                                                                  request.domain)}
                )
            user_props['id_token'] = id_token
            return user_props

        request.set_property(get_user_info, "user_info", True)
