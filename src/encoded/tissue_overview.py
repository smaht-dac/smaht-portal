from pyramid.view import view_config
import structlog
from snovault.search.search import search
from snovault.util import debug_log

log = structlog.getLogger(__name__)

# Adapted from browse.py's /browse route: keys a page by tissue_type (a
# calculated, non-stored property) instead of a single Tissue item's uuid.
# forced_type must be "Tissue-Overview" (token "tissue-overview") since
# Snovault's SearchBuilder/canonical_redirect derive both the route name and
# the response '@id' path segment from forced_type.lower(), which must match
# the actual '/tissue-overview' route.


def includeme(config):
    config.add_route('tissue-overview', '/tissue-overview{slash:/?}')
    config.scan(__name__)


DEFAULT_TISSUE_OVERVIEW_TYPE = "Tissue"

# Mirrors static/components/util/data.js's `tissueInternalCodeByTpcCode` -- keep
# both in sync by hand. Maps the stable 4-letter internal code used in a
# /tissue-overview/?tissue_type=<code> URL (e.g. "HART") to the TPC protocol code
# stored in Tissue.tissue_type_code (e.g. "3S"), for exact, code-only filtering.
# Do NOT source this from static/data/color-schemes/smaht_tissue_colors.json --
# that's a public color-palette export, not an internal data source, despite
# carrying the same code pairs.
TPC_CODE_BY_INTERNAL_CODE = {
    'BLOO': '3A',
    'BUCC': '3B',
    'ESOP': '3C',
    'COAS': '3E',
    'CODS': '3G',
    'LIVR': '3I',
    'ADGL': '3K',
    'ADGR': '3M',
    'AORT': '3O',
    'LUNG': '3Q',
    'HART': '3S',
    'TESL': '3U',
    'TESR': '3W',
    'OVAL': '3Y',
    'OVAR': '3AA',
    'FBRO': '3AC',
    'SKSE': '3AD',
    'SKNE': '3AF',
    'MUSC': '3AH',
    'BRFL': '3AK',
    'BRTL': '3AL',
    'BRCE': '3AM',
    'BRHL': '3AN',
    'BRHR': '3AO',
}


@view_config(route_name='tissue-overview', request_method='GET', permission='search')
@debug_log
def tissue_overview(context, request, search_type=DEFAULT_TISSUE_OVERVIEW_TYPE, return_generator=False):
    """
    Reuse search results for the tissue overview view, forced to a
    synthetic 'Tissue-Overview' @type so the frontend can route to a real
    tissue_type-keyed page instead of an arbitrary Tissue item's page.
    """
    search_type = request.params.get('type', DEFAULT_TISSUE_OVERVIEW_TYPE)

    # This page always needs every Tissue record for the requested tissue_type
    # (the frontend uses '@graph' directly as its donor/aliquot dataset, see
    # TissueTypeView.js) and is always scoped to Tissue -- force both server-side.
    # Setting these on request.GET (a webob GetDict) rewrites QUERY_STRING in
    # place, so SearchBuilder's normalized '@id' stays consistent without
    # requiring these params in the address bar.
    if 'limit' not in request.GET:
        request.GET['limit'] = 'all'
    if 'type' not in request.GET:
        request.GET['type'] = search_type
    # This page's donor population is always "released Production donors"
    # (matching Browse by Donor/Browse by File, see types/tissue.py's
    # embedded_list) -- force it here rather than relying on the URL.
    if 'donor.study' not in request.GET:
        request.GET['donor.study'] = 'Production'
    if 'donor.tags' not in request.GET:
        request.GET['donor.tags'] = 'has_released_files'

    # The frontend now generates a short internal code (e.g. "HART") for
    # `tissue_type` in the URL (see tissue-overview/helpers.js's
    # getTissueTypeUrlCode), but Tissue.tissue_type stores the full "<TPC code>
    # - <name>" string, so rewrite known codes to an exact filter on
    # Tissue.tissue_type_code instead. An older bookmarked URL carrying the raw
    # "<TPC code> - <name>" value isn't a known code, so it falls through
    # unchanged and still matches via the legacy `tissue_type` field.
    display_tissue_type = request.GET.get('tissue_type')
    tpc_code = TPC_CODE_BY_INTERNAL_CODE.get((display_tissue_type or '').upper())
    if tpc_code:
        del request.GET['tissue_type']
        request.GET['tissue_type_code'] = tpc_code

    result = search(context, request, search_type, return_generator, forced_type="Tissue-Overview")

    # search() sets result['title'] to forced_type verbatim, and the frontend's
    # <title> tag reads that field directly, so without this every tissue_type
    # would get the same literal "Tissue-Overview" browser tab title. Uses the
    # original display value captured above since request.GET['tissue_type']
    # may have just been deleted.
    if isinstance(result, dict) and display_tissue_type:
        result['title'] = display_tissue_type

    return result
