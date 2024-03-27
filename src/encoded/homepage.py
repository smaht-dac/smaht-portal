from pyramid.view import view_config
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from snovault.search.search import (
    search
)
from snovault.search.search_utils import make_search_subreq
from urllib.parse import urlencode
import concurrent.futures


import structlog


log = structlog.getLogger(__name__)


def includeme(config):
    config.add_route('home', '/home')
    config.scan(__name__)


def make_concurrent_search_requests(search_helpers):
    """ Execute multiple search functions concurrently using a thread pool (since this is I/O bound). """
    results = [-1] * len(search_helpers)  # watch out for -1 counts as indicative of an error
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = []
        for i, (func, kwargs) in enumerate(search_helpers):
            future = executor.submit(func, **kwargs)
            futures.append((i, future))
        for i, future in futures:  # block in order so ordering is preserved
            try:
                result = future.result()
                results[i] = result
            except Exception as e:
                print(f"Exception occurred in function {search_helpers[i][0].__name__}: {e}")
    return results


def extract_desired_facet_from_search(facets, desired_facet_name):
    """ Grabs a single facet from a search response facets block """
    for d in facets:
        if d['field'] == desired_facet_name:
            return d
    return None


def generate_colo829_cell_line_file_count(context, request):
    """ Makes a search subrequest for released + public + restricted files
        NOTE: this will need to be updated as we get more file requests
    """
    search_param = {
        'type': 'File',
        'status': ['released', 'restricted', 'public'],
        'limit': 0
    }
    subreq = make_search_subreq(request, '{}?{}'.format('/search', urlencode(search_param, True)), inherit_user=True)
    result = search(context, subreq)
    return result['total']


def generate_colo829_assay_count(context, request):
    """ Makes a search subrequest the same as the above to extract the assay counts """
    search_param = {
        'type': 'File',
        'status': ['released', 'restricted', 'public'],
        'limit': 0
    }
    subreq = make_search_subreq(request, '{}?{}'.format('/search', urlencode(search_param, True)), inherit_user=True)
    result = search(context, subreq)
    assays = extract_desired_facet_from_search(result['facets'], 'file_sets.libraries.assay.display_title')
    assay_sum = len(assays['terms']) - 1  # remove "No value"
    return assay_sum


@view_config(route_name='home', request_method=['GET'])
@debug_log
def home(context, request):
    ignored(context), ignored(request)
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
