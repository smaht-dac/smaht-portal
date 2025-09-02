from pyramid.httpexceptions import HTTPFound
from pyramid.security import Authenticated
from pyramid.view import view_config
import structlog
from webob.multidict import MultiDict
from urllib.parse import urlencode
from snovault.search.search import search
from snovault.util import debug_log
from encoded.endpoints.recent_files_summary.recent_files_summary import recent_files_summary_endpoint

log = structlog.getLogger(__name__)

# 2024-11-19/dmichaels: Adapted from fourfront for C4-1184.

def includeme(config):
    config.add_route('browse', '/browse{slash:/?}')
    config.add_route("recent_files_summary", "/recent_files_summary")
    config.scan(__name__)


# DEFAULT_BROWSE_TYPE = "FileSet"
# DEFAULT_BROWSE_TYPE = "UnalignedReads"
# DEFAULT_BROWSE_TYPE = "OutputFile"

DEFAULT_BROWSE_TYPE = "File"
DEFAULT_BROWSE_FACETS = ["file_size"]

DEFAULT_BROWSE_PARAM_LISTS = {
    "type": [DEFAULT_BROWSE_TYPE],
    "sample_summary.studies": ["Production"],
    "status": ["released"],
    # "additional_facet": DEFAULT_BROWSE_FACETS
}

@view_config(route_name='browse', request_method='GET', permission='search')
@debug_log
def browse(context, request, search_type=DEFAULT_BROWSE_TYPE, return_generator=False):
    """
    Simply use search results for browse view
    Redirect to proper URL w. params if needed
    """
    orig_params = request.params
    for k,vals in DEFAULT_BROWSE_PARAM_LISTS.items():
        if k not in orig_params or orig_params[k] not in vals:
            # Redirect to DEFAULT_BROWSE_PARAM_LISTS URL
            next_qs = MultiDict()
            for k2, v2list in DEFAULT_BROWSE_PARAM_LISTS.items():
                for v2 in v2list:
                    next_qs.add(k2, v2)
            # Preserve other keys that arent in DEFAULT_BROWSE_PARAM_LISTS
            for k2, v2 in orig_params.items():
                if k2 not in DEFAULT_BROWSE_PARAM_LISTS:
                    next_qs.add(k2, v2)
            # next_qs.add("redirected_from", str(request.path_qs))
            return HTTPFound(
                location=str(request.path) + '?' +  urlencode(next_qs),
                detail="Redirected from " + str(request.path_info)
            )

    return search(context, request, search_type, return_generator, forced_type="Browse")


# @view_config(route_name="recent_files_summary", request_method=["GET"], effective_principals=Authenticated)
@view_config(route_name="recent_files_summary", request_method=["GET"], permission="search")
@debug_log
def recent_files_summary(context, request):
    return recent_files_summary_endpoint(context, request)
