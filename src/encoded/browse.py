from pyramid.httpexceptions import HTTPForbidden, HTTPFound
from pyramid.security import Authenticated, NO_PERMISSION_REQUIRED
from pyramid.view import view_config
import structlog
from webob.multidict import MultiDict
from urllib.parse import urlencode
from snovault.search.search import search
from snovault.util import debug_log
from encoded.endpoints.recent_files_summary.recent_files_summary import (
    recent_files_summary_endpoint,
    recent_release_days_endpoint
)
from encoded.types.protected_donor import is_protected_donor_search, log_protected_donor_search

log = structlog.getLogger(__name__)

# 2024-11-19/dmichaels: Adapted from fourfront for C4-1184.

def includeme(config):
    config.add_route('browse', '/browse{slash:/?}')
    config.add_route("recent_files_summary", "/recent_files_summary")
    config.add_route("recent_release_days", "/recent_release_days")
    config.scan(__name__)


# DEFAULT_BROWSE_TYPE = "FileSet"
# DEFAULT_BROWSE_TYPE = "UnalignedReads"
# DEFAULT_BROWSE_TYPE = "OutputFile"

DEFAULT_BROWSE_TYPE = "File"
DEFAULT_BROWSE_FACETS = ["file_size"]

@view_config(route_name='browse', request_method='GET', permission='search')
@debug_log
def browse(context, request, search_type=DEFAULT_BROWSE_TYPE, return_generator=False):
    """
    Simply use search results for browse view
    Redirect to proper URL w. params if needed
    """
    search_type = request.params.get('type', DEFAULT_BROWSE_TYPE)

    result = search(context, request, search_type, return_generator, forced_type="Browse")
    if is_protected_donor_search(context, request):
        log_protected_donor_search(request, result)
    return result


@view_config(
    route_name="search",
    request_method="GET",
    permission=NO_PERMISSION_REQUIRED,
    custom_predicates=[is_protected_donor_search],
)
@debug_log
def protected_donor_search(context, request):
    """Audit ProtectedDonor searches while retaining Snovault's search behavior."""
    if not request.has_permission("search"):
        log_protected_donor_search(request, None, outcome="denied")
        raise HTTPForbidden()
    try:
        result = search(context, request, forced_type="Search")
    except Exception:
        log_protected_donor_search(request, None, outcome="failure")
        raise
    log_protected_donor_search(request, result)
    return result


# @view_config(route_name="recent_files_summary", request_method=["GET"], effective_principals=Authenticated)
@view_config(route_name="recent_files_summary", request_method=["GET"], permission="search")
@debug_log
def recent_files_summary(context, request):
    return recent_files_summary_endpoint(context, request)


@view_config(route_name="recent_release_days", request_method=["GET"], permission="search")
@debug_log
def recent_release_days(context, request):
    return recent_release_days_endpoint(context, request)
