import structlog

from pyramid.httpexceptions import HTTPUnauthorized
from pyramid.request import Request
from snovault.authentication import get_jwt_from_auth_header
from snovault.project.authentication import SnovaultProjectAuthentication

from ..audit_logging import authenticated_actor_fields


log = structlog.getLogger(__name__)


class SMAHTProjectAuthentication(SnovaultProjectAuthentication):
    def login(self, context, request, *, samesite):
        try:
            response = super().login(context, request, samesite=samesite)
        except Exception:
            # Do not include request data here. The token is intentionally not
            # copied into the application log stream.
            log.warning("User login failed", action="login", outcome="failure", event_type="user_login")
            raise
        actor = {}
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
        except Exception:
            pass
        log.warning(
            "User login successful" if actor else "User login failed",
            action="login",
            outcome="success" if actor else "failure",
            event_type="user_login",
            **actor,
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
