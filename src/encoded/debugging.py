from pyramid.security import Authenticated
from pyramid.view import view_config
from snovault.util import debug_log


def includeme(config):
    config.add_route("debug_user_principals", "/debug_user_principals")
    config.scan(__name__)

@view_config(route_name="debug_user_principals", request_method=["GET"], effective_principals=Authenticated)
@debug_log
def debug_user_principals(context, request):
    """
    Returns the list of principals for the calling user.
    For debugging/troubleshooting/understanding only.
    """
    return request.effective_principals
