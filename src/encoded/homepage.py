import traceback
from datetime import datetime
from pyramid.view import view_config
from snovault.util import debug_log
from concurrent.futures import ThreadPoolExecutor
from structlog import getLogger
from .utils import generate_admin_search_given_params


log = getLogger(__name__)

# Sentinel value used to seed concurrent search results; any slot still holding this
# after execution indicates the corresponding search raised (see
# make_concurrent_search_requests). It must never be rendered to a client - the
# response-assembly extractors below coerce it to 0 / None.
SEARCH_ERROR_SENTINEL = -1


def includeme(config):
    config.add_route('home', '/home')
    config.scan(__name__)


class SearchBase:
    """ Contains search params for getting various bits of information from the ES """
    LATEST_RELEASE_DATE_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['open', 'open-early', 'open-network', 'protected-network', 'protected', 'protected-early',],
        'sort': '-file_status_tracking.release_dates.initial_release_date',
        'limit': 1,
    }
    ALL_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['open', 'open-early', 'open-network', 'protected-network', 'protected', 'protected-early',],
        'additional_facet': [
            'assays.display_title'
        ]
    }
    COLO829_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['open', 'open-early', 'open-network', 'protected-network', 'protected', 'protected-early',],
        'dataset': ['colo829blt_50to1', 'colo829t', 'colo829bl'],
        'additional_facet': [
            'assays.display_title'
        ]
    }
    HAPMAP_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['open', 'open-early', 'open-network', 'protected-network', 'protected', 'protected-early',],
        'dataset': ['hapmap'],
        'additional_facet': [
            'assays.display_title'
        ]
    }
    IPSC_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['open', 'open-early', 'open-network', 'protected-network', 'protected', 'protected-early',],
        'dataset': ['lb_fibroblast', 'lb_ipsc_1', 'lb_ipsc_2', 'lb_ipsc_4', 'lb_ipsc_52', 'lb_ipsc_60'],
        'additional_facet': [
            'assays.display_title'
        ]
    }
    TISSUES_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['open', 'open-early', 'open-network', 'protected-network', 'protected', 'protected-early',],
        'dataset': ['tissue'],
        'file_sets.libraries.analytes.samples.sample_sources.code': [
            'ST001-1A',
            'ST001-1D',
            'ST002-1G',
            'ST002-1D',
            'ST003-1Q',
            'ST004-1Q'
        ],
        'additional_facet': [
            'donors.display_title', 'assays.display_title'
        ]  # required since this is default_hidden for now
    }
    PRODUCTION_TISSUES_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['open', 'open-early', 'open-network', 'protected', 'protected-early', 'protected-network'],
        'sample_summary.studies': ['Production'],
        'dataset!': ['No value'],
        'additional_facet': [
            'assays.display_title',
            'file_sets.libraries.analytes.samples.sample_sources.uberon_id'
        ]
    }


def make_concurrent_search_requests(search_helpers):
    """ Execute multiple search functions concurrently using a thread pool (since this is I/O bound).

        VERY IMPORTANT NOTE: Snovault's default DBSession is **NOT** threadsafe - therefore you CANNOT use this to
        make database requests (including doing things like looking up users on auth). You must use a remote_user
        that results in a synthetic_result from the auth code. This also applies to access keys!

        If you use this to make database requests, you will leak connections and start generating server
        side errors!
    """
    results = [SEARCH_ERROR_SENTINEL] * len(search_helpers)  # watch out for -1 counts as indicative of an error
    with ThreadPoolExecutor() as executor:
        futures = []
        for i, (func, kwargs) in enumerate(search_helpers):
            future = executor.submit(func, **kwargs)
            futures.append((i, future))
        for i, future in futures:  # block in order so ordering is preserved
            try:
                result = future.result()
                results[i] = result
            except Exception as e:
                log.error(f"Exception occurred in function {search_helpers[i][0].__name__}: {e}")
                traceback_str = ''.join(traceback.format_exception(type(e), e, e.__traceback__))
                log.error(traceback_str)
    return results


def extract_desired_facet_from_search(facets, desired_facet_name):
    """ Grabs a single facet from a search response facets block """
    for d in facets:
        if d['field'] == desired_facet_name:
            if 'original_terms' in d:
                d['terms'] = d['original_terms']  # discard group_by_field information
            return d
    log.error(f'Did not locate specified facet on homepage: {desired_facet_name}')
    return {}


def generate_search_result(context, request, search_param):
    """ Runs a single admin ``limit=0`` search for the given params and returns the whole
        result. A ``limit=0`` response already contains BOTH the ``total`` and the full
        ``facets`` block, so one search per distinct param dict is enough to derive every
        stat (total + each facet count) - see the extractors below. This avoids firing a
        separate ES round-trip per stat.

        Builds a copy of ``search_param`` with ``limit`` set rather than mutating the
        (shared, class-level) param dict.
    """
    search_param = {**search_param, 'limit': 0}  # we only care about total + facet counts
    return generate_admin_search_given_params(context, request, search_param)


def extract_total_from_search(result):
    """ Pure extractor: total hit count from a search result. Coerces the error sentinel
        (or any non-dict result) to 0 so a failed sub-search never renders as -1. """
    if not isinstance(result, dict):
        return 0
    return result.get('total', 0)


def extract_unique_facet_count_from_search(result, desired_facet):
    """ Pure extractor: number of unique terms for ``desired_facet`` in a search result.
        Degrades gracefully to 0 when the search failed (sentinel/non-dict) or the facet
        is absent from the response, rather than crashing. """
    if not isinstance(result, dict):
        return 0
    facet = extract_desired_facet_from_search(result.get('facets', []), desired_facet)
    # correct for no value, worst case we check the whole list of facet terms
    # but this is usually a manageable sized list - Will 28 March 2024
    terms = facet.get('terms', [])  # missing facet -> 0 rather than KeyError
    for term in terms:
        if term['key'] == 'No value':
            return len(terms) - 1
    return len(terms)


def generate_latest_release_date(context, request):
    """ Makes a search subrequest for the latest release date """
    search_param = SearchBase.LATEST_RELEASE_DATE_SEARCH_PARAMS
    result = generate_admin_search_given_params(context, request, search_param)
    graph = result.get('@graph', [])
    if not graph:
        return None
    return graph[0].get('file_status_tracking', {}).get('release_dates', {}).get('initial_release_date')


def format_release_date(release_date):
    """ Formats the stored ISO release date as YYYY-MM-DD, or None when it is missing,
        the error sentinel, or otherwise unparseable (guards against a single failed
        release-date sub-search 500ing the whole homepage). """
    if not isinstance(release_date, str):
        return None
    try:
        return datetime.fromisoformat(release_date).strftime("%Y-%m-%d")
    except ValueError:
        return None


@view_config(route_name='home', request_method=['GET'])
@debug_log
def home(context, request):
    """ Homepage API - has structure based on the front-end
        Uses a threadpool to make several async requests to the ES to extract data for
        homepage statistics
    """
    # One search per distinct param dict. A single limit=0 response carries both the
    # 'total' and the full 'facets' block, so every stat below is derived from these six
    # results via pure extractors rather than a fresh ES round-trip per stat.
    search_results = make_concurrent_search_requests([
        # latest release date
        (generate_latest_release_date, {'context': context, 'request': request}),  # 0
        # per cell-line / tissue-set searches (each yields total + facets)
        (generate_search_result,
         {'context': context, 'request': request,
          'search_param': SearchBase.COLO829_RELEASED_FILES_SEARCH_PARAMS}),  # 1
        (generate_search_result,
         {'context': context, 'request': request,
          'search_param': SearchBase.HAPMAP_RELEASED_FILES_SEARCH_PARAMS}),  # 2
        (generate_search_result,
         {'context': context, 'request': request,
          'search_param': SearchBase.IPSC_RELEASED_FILES_SEARCH_PARAMS}),  # 3
        (generate_search_result,
         {'context': context, 'request': request,
          'search_param': SearchBase.TISSUES_RELEASED_FILES_SEARCH_PARAMS}),  # 4
        (generate_search_result,
         {'context': context, 'request': request,
          'search_param': SearchBase.PRODUCTION_TISSUES_FILES_SEARCH_PARAMS}),  # 5
    ])
    release_date, colo829, hapmap, ipsc, tissues, production = search_results
    response = {
        '@context': '/home',
        '@id': '/home',
        'date': format_release_date(release_date),
        '@graph': [
            {
                "title": "Benchmarking",
                "subtitle": "with all technologies",
                "categories": [
                    {
                        "title": "COLO829 Cell Line",
                        "link": "/data/benchmarking/COLO829",
                        "figures": [
                            { "value": 2, "unit": "Cell Lines" },
                            { "value": extract_unique_facet_count_from_search(colo829, 'assays.display_title'),
                              "unit": "Assays" },
                            { "value": 0, "unit": "Mutations" },
                            { "value": extract_total_from_search(colo829),
                              "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "HapMap Cell Line",
                        "link": "/data/benchmarking/HapMap",
                        "figures": [
                            { "value": 6, "unit": "Cell Lines" },
                            { "value": extract_unique_facet_count_from_search(hapmap, 'assays.display_title'), "unit": "Assays" },
                            { "value": 0, "unit": "Mutations" },
                            { "value": extract_total_from_search(hapmap), "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "iPSC & Fibroblasts",
                        "link": "/data/benchmarking/iPSC-fibroblasts",
                        "figures": [
                            { "value": 5, "unit": "Cell Lines" },
                            { "value": extract_unique_facet_count_from_search(ipsc, 'assays.display_title'), "unit": "Assays" },
                            { "value": 0, "unit": "Mutations" },
                            { "value": extract_total_from_search(ipsc), "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "Benchmarking Tissues",
                        "link": "/data/benchmarking/donor-st001",
                        "figures": [
                            { "value": extract_unique_facet_count_from_search(tissues, 'donors.display_title'), "unit": "Donors" },
                            { "value": 4, "unit": "Tissue Types" },
                            { "value": extract_unique_facet_count_from_search(tissues, 'assays.display_title'), "unit": "Assays" },
                            { "value": extract_total_from_search(tissues), "unit": "Files Generated" }
                        ]
                    }
                ]
            },
            {
                "title": "Production",
                "subtitle": "with core + additional technologies",
                "categories": [
                    {
                        "title": "Primary Tissues",
                        "link": "/browse",
                        "figures": [
                            { "value": extract_unique_facet_count_from_search(production, 'donors.display_title'), "unit": "Donors" },
                            { "value": extract_unique_facet_count_from_search(production, 'sample_summary.tissues'), "unit": "Tissue Types" },
                            { "value": extract_unique_facet_count_from_search(production, 'assays.display_title'), "unit": "Assays" },
                            { "value": extract_total_from_search(production), "unit": "Files Generated" }
                        ]
                    }
                ]
            },
        ]
    }
    return response
