from pyramid.view import view_config
from snovault.util import debug_log
from snovault.search.search import (
    search
)
from snovault.search.search_utils import make_search_subreq
from urllib.parse import urlencode
from concurrent.futures import ThreadPoolExecutor
from structlog import getLogger


log = getLogger(__name__)


def includeme(config):
    config.add_route('home', '/home')
    config.scan(__name__)


class SearchBase:
    """ Contains search params for getting various bits of information from the ES """
    ALL_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['released', 'restricted', 'public'],
    }
    COLO829_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['released', 'restricted', 'public'],
        'dataset': ['colo829blt_50to1', 'colo829t', 'colo829bl']
    }


def make_concurrent_search_requests(search_helpers):
    """ Execute multiple search functions concurrently using a thread pool (since this is I/O bound). """
    results = [-1] * len(search_helpers)  # watch out for -1 counts as indicative of an error
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
    return results


def extract_desired_facet_from_search(facets, desired_facet_name):
    """ Grabs a single facet from a search response facets block """
    for d in facets:
        if d['field'] == desired_facet_name:
            return d
    log.error(f'Did not locate specified facet on homepage: {desired_facet_name}')
    return None


def generate_admin_search_given_params(context, request, search_param):
    """ Helper function for below that generates/executes a search given params AS ADMIN
        BE EXTREMELY CAREFUL WITH THIS - do NOT use to return results directly
    """
    request.remote_user = 'EMBED'  # this allows the below search to execute as admin
    subreq = make_search_subreq(request, f'/search?{urlencode(search_param, True)}')
    return search(context, subreq)


def generate_search_total(context, request, search_param):
    """ Helper function that executes a search and extracts the total """
    search_param['limit'] = 0  # we do not care about search results, just total
    return generate_admin_search_given_params(context, request, search_param)['total']


def generate_unique_facet_count(context, request, search_param, desired_fact):
    """ Helper function that extracts the number of unique facet terms """
    search_param['limit'] = 0  # we do not care about search results, just facet counts
    result = generate_admin_search_given_params(context, request, search_param)
    facet = extract_desired_facet_from_search(result['facets'], desired_fact)
    return len(facet['terms']) - 1  # remove "No value"


def generate_colo829_cell_line_file_count(context, request):
    """ Makes a search subrequest for released + public + restricted files """
    search_param = SearchBase.COLO829_RELEASED_FILES_SEARCH_PARAMS
    return generate_search_total(context, request, search_param)


def generate_colo829_assay_count(context, request):
    """ Makes a search subrequest the same as the above to extract the assay counts """
    search_param = SearchBase.COLO829_RELEASED_FILES_SEARCH_PARAMS
    return generate_unique_facet_count(context, request, search_param, 'file_sets.libraries.assay.display_title')


@view_config(route_name='home', request_method=['GET'])
@debug_log
def home(context, request):
    """ Homepage API - has structure based on the front-end """
    search_results = make_concurrent_search_requests([
        (generate_colo829_assay_count, {'context': context, 'request': request}),
        (generate_colo829_cell_line_file_count, {'context': context, 'request': request})
    ])
    response = {
        '@graph': [
            {
                "title": "Tier 0: Benchmarking",
                "subtitle": "with all technologies",
                "categories": [
                    {
                        "title": "COLO829 Cell Line",
                        "link": "/data/benchmarking/COLO829#main",
                        "figures": [
                            { "value": 2, "unit": "Cell Lines" },
                            { "value": search_results[0],
                              "unit": "Assays" },
                            { "value": 0, "unit": "Mutations" },
                            { "value": search_results[1],
                              "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "HapMap Cell Line",
                        "link": "/data/benchmarking/HapMap#main",
                        "figures": [
                            { "value": 6, "unit": "Cell Lines" },
                            { "value": 0, "unit": "Assays" },
                            { "value": 0, "unit": "Mutations" },
                            { "value": 0, "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "iPSC & Fibroblasts",
                        "link": "/data/benchmarking/iPSC-fibroblasts#main",
                        "figures": [
                            { "value": 5, "unit": "Cell Lines" },
                            { "value": 0, "unit": "Assays" },
                            { "value": 0, "unit": "Mutations" },
                            { "value": 0, "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "Benchmarking Tissues",
                        "link": "/data/benchmarking/lung#main",
                        "figures": [
                            { "value": 0, "unit": "Donors" },
                            { "value": 0, "unit": "Tissue Types" },
                            { "value": 0, "unit": "Assays" },
                            { "value": 0, "unit": "Files Generated" }
                        ]
                    }
                ]
            },
            {
                "title": "Tier 1",
                "subtitle": "with core + additional technologies",
                "categories": [
                    {
                        "title": "Primary Tissues",
                        "figures": [
                            { "value": 0, "unit": "Donors" },
                            { "value": 0, "unit": "Tissue Types" },
                            { "value": 0, "unit": "Assays" },
                            { "value": 0, "unit": "Files Generated" }
                        ]
                    }
                ]
            },
            {
                "title": "Tier 2",
                "subtitle": "with core technologies",
                "categories": [
                    {
                        "title": "Primary Tissues",
                        "figures": [
                            { "value": 0, "unit": "Donors" },
                            { "value": 0, "unit": "Tissue Types" },
                            { "value": 0, "unit": "Assays" },
                            { "value": 0, "unit": "Files Generated" }
                        ]
                    }
                ]
            }
        ]
    }
    return response
