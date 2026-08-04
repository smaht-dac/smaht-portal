from pyramid.view import view_config
import structlog
from snovault.search.search import search
from snovault.util import debug_log

log = structlog.getLogger(__name__)

# Adapted from browse.py's /browse route: keys a page by tissue_type (a
# calculated, non-stored property) instead of a single Tissue item's uuid.
#
# Snovault's SearchBuilder builds the response '@id' as
# '/' + forced_type.lower() + '/' + search_base (search.py:449), and
# clear_filters_setup() resolves that same token back to a route via
# request.route_path(forced_type.lower(), ...) (search.py:443-444). The
# renderer's canonical_redirect (renderers.py:277) then 302s any request
# whose path doesn't match that '@id' -- so forced_type.lower() must equal
# both the route *name* and the URL path segment, not just the route name.
# forced_type is therefore "Tissue-Overview" (token "tissue-overview"),
# matching the '/tissue-overview' path exactly.


def includeme(config):
    config.add_route('tissue-overview', '/tissue-overview{slash:/?}')
    config.scan(__name__)


DEFAULT_TISSUE_OVERVIEW_TYPE = "Tissue"


@view_config(route_name='tissue-overview', request_method='GET', permission='search')
@debug_log
def tissue_overview(context, request, search_type=DEFAULT_TISSUE_OVERVIEW_TYPE, return_generator=False):
    """
    Reuse search results for the tissue overview view, forced to a
    synthetic 'Tissue-Overview' @type so the frontend can route to a real
    tissue_type-keyed page instead of an arbitrary Tissue item's page.
    """
    search_type = request.params.get('type', DEFAULT_TISSUE_OVERVIEW_TYPE)

    # This page always needs every Tissue record for the requested
    # tissue_type (the frontend uses the response '@graph' directly as its
    # donor/aliquot dataset, see TissueTypeView.js) and is always scoped to
    # Tissue -- force both server-side rather than relying on callers to
    # spell them out in the URL. request.GET is a webob GetDict; setting a
    # key on it rewrites the underlying QUERY_STRING in place (see
    # GetDict.on_change in webob/multidict.py), so both SearchBuilder's
    # normalized '@id' and canonical_redirect's own request.query_string
    # comparison (renderers.py:277) end up derived from this same,
    # already-updated query string -- keeping these two params optional in
    # the address bar without retriggering that redirect.
    if 'limit' not in request.GET:
        request.GET['limit'] = 'all'
    if 'type' not in request.GET:
        request.GET['type'] = search_type
    # This page's donor population is always "released Production donors"
    # (matching Browse by Donor/Browse by File, see types/tissue.py's
    # embedded_list) -- not a per-request choice, so force it here too
    # rather than leaving callers to spell it out in the URL.
    if 'donor.study' not in request.GET:
        request.GET['donor.study'] = 'Production'
    if 'donor.tags' not in request.GET:
        request.GET['donor.tags'] = 'has_released_files'

    result = search(context, request, search_type, return_generator, forced_type="Tissue-Overview")

    # search() always sets result['title'] to forced_type verbatim
    # (search.py:451), and the frontend's <title> tag (app.js's HTMLTitle)
    # reads that field directly -- so without this, every tissue_type gets
    # the same literal "Tissue-Overview" browser tab title. Overriding it
    # here doesn't touch forced_type/the route name/canonical-redirect
    # matching above (all keyed on forced_type, not on this display field).
    tissue_type = request.GET.get('tissue_type')
    if isinstance(result, dict) and tissue_type:
        result['title'] = tissue_type

    return result
