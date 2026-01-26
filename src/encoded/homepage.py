import traceback
from datetime import datetime
from pytz import timezone
from pyramid.view import view_config
from snovault.util import debug_log
from concurrent.futures import ThreadPoolExecutor
from structlog import getLogger
from .utils import generate_admin_search_given_params, generate_search_total


log = getLogger(__name__)


def includeme(config):
    config.add_route('home', '/home')
    config.scan(__name__)


class SearchBase:
    """ Contains search params for getting various bits of information from the ES """
    ALL_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['released', 'protected-network', 'open', 'protected', 'protected-early', 'public'],  # TODO remove released
        'additional_facet': [
            'file_sets.libraries.assay.display_title'
        ]
    }
    COLO829_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['released', 'protected-network', 'open', 'protected', 'protected-early', 'public'],  # TODO remove released
        'dataset': ['colo829blt_50to1', 'colo829t', 'colo829bl'],
        'additional_facet': [
            'file_sets.libraries.assay.display_title'
        ]
    }
    HAPMAP_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['released', 'protected-network', 'open', 'protected', 'protected-early', 'public'],  # TODO remove released
        'dataset': ['hapmap'],
        'additional_facet': [
            'file_sets.libraries.assay.display_title'
        ]
    }
    IPSC_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['released', 'protected-network', 'open', 'protected', 'protected-early', 'public'],  # TODO remove released
        'dataset': ['lb_fibroblast', 'lb_ipsc_1', 'lb_ipsc_2', 'lb_ipsc_4', 'lb_ipsc_52', 'lb_ipsc_60'],
        'additional_facet': [
            'file_sets.libraries.assay.display_title'
        ]
    }
    TISSUES_RELEASED_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['released', 'protected-network', 'open', 'protected', 'protected-early', 'public'],  # TODO remove released
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
            'donors.display_title', 'file_sets.libraries.assay.display_title'
        ]  # required since this is default_hidden for now
    }
    PRODUCTION_TISSUES_FILES_SEARCH_PARAMS = {
        'type': 'File',
        'status': ['released', 'protected-network', 'open', 'protected', 'protected-early', 'public'],  # TODO remove released
        'sample_summary.studies': ['Production'],
        'additional_facet': [
            'file_sets.libraries.assay.display_title',
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


def generate_unique_facet_count(context, request, search_param, desired_facet):
    """ Helper function that extracts the number of unique facet terms """
    search_param['limit'] = 0  # we do not care about search results, just facet counts
    result = generate_admin_search_given_params(context, request, search_param)
    facet = extract_desired_facet_from_search(result['facets'], desired_facet)
    # correct for no value, worst case we check the whole list of facet terms
    # but this is usually a manageable sized list - Will 28 March 2024
    for term in facet['terms']:
        if term['key'] == 'No value':
            return len(facet['terms']) - 1
    return len(facet['terms'])


def generate_colo829_cell_line_file_count(context, request):
    """ Makes a search subrequest for released + public + restricted files for colo829 """
    search_param = SearchBase.COLO829_RELEASED_FILES_SEARCH_PARAMS
    return generate_search_total(context, request, search_param)


def generate_colo829_assay_count(context, request):
    """ Makes a search subrequest the same as the above to extract the assay counts for colo829 """
    search_param = SearchBase.COLO829_RELEASED_FILES_SEARCH_PARAMS
    return generate_unique_facet_count(context, request, search_param, 'file_sets.libraries.assay.display_title')


def generate_hapmap_cell_line_file_count(context, request):
    """ Makes a search subrequest for released + public + restricted files for hapmap """
    search_param = SearchBase.HAPMAP_RELEASED_FILES_SEARCH_PARAMS
    return generate_search_total(context, request, search_param)


def generate_hapmap_assay_count(context, request):
    """ Makes a search subrequest the same as the above to extract the assay counts for hapmap """
    search_param = SearchBase.HAPMAP_RELEASED_FILES_SEARCH_PARAMS
    return generate_unique_facet_count(context, request, search_param, 'file_sets.libraries.assay.display_title')


def generate_ipsc_cell_line_file_count(context, request):
    """ Makes a search subrequest for released + public + restricted files for ipsc """
    search_param = SearchBase.IPSC_RELEASED_FILES_SEARCH_PARAMS
    return generate_search_total(context, request, search_param)


def generate_ipsc_assay_count(context, request):
    """ Makes a search subrequest the same as the above to extract the assay counts for ipsc """
    search_param = SearchBase.IPSC_RELEASED_FILES_SEARCH_PARAMS
    return generate_unique_facet_count(context, request, search_param, 'file_sets.libraries.assay.display_title')


def generate_tissue_file_count(context, request):
    """ Get total file count for benchmarking tissues """
    search_param = SearchBase.TISSUES_RELEASED_FILES_SEARCH_PARAMS
    return generate_search_total(context, request, search_param)


def generate_tissue_donor_count(context, request):
    """ Get benchmarking tissue donor count by aggregating on donor """
    search_param = SearchBase.TISSUES_RELEASED_FILES_SEARCH_PARAMS
    return generate_unique_facet_count(context, request, search_param, 'donors.display_title')


def generate_tissue_assay_count(context, request):
    """ Get total assay count for benchmarking tissues """
    search_param = SearchBase.TISSUES_RELEASED_FILES_SEARCH_PARAMS
    return generate_unique_facet_count(context, request, search_param, 'file_sets.libraries.assay.display_title')


def generate_production_file_count(context, request):
    """ Get total file count for production tissues """
    search_param = SearchBase.PRODUCTION_TISSUES_FILES_SEARCH_PARAMS
    return generate_search_total(context, request, search_param)


def generate_production_tissue_donor_count(context, request):
    """ Get production tissue donor count """
    search_param = SearchBase.PRODUCTION_TISSUES_FILES_SEARCH_PARAMS
    return generate_unique_facet_count(context, request, search_param, 'donors.display_title')


def generate_production_tissue_assay_count(context, request):
    """ Get production tissue assay counts """
    search_param = SearchBase.PRODUCTION_TISSUES_FILES_SEARCH_PARAMS
    return generate_unique_facet_count(context, request, search_param, 'file_sets.libraries.assay.display_title')


def generate_production_tissue_type_count(context, request):
    """ Get production tissue type counts """
    search_param = SearchBase.PRODUCTION_TISSUES_FILES_SEARCH_PARAMS
    return generate_unique_facet_count(context, request, search_param, 'sample_summary.tissues')


@view_config(route_name='home', request_method=['GET'])
@debug_log
def home(context, request):
    """ Homepage API - has structure based on the front-end
        Uses a threadpool to make several async requests to the ES to extract data for
        homepage statistics
    """
    search_results = make_concurrent_search_requests([
        # colo829 stats
        (generate_colo829_assay_count, {'context': context, 'request': request}),  # 0
        (generate_colo829_cell_line_file_count, {'context': context, 'request': request}),  # 1

        # HapMap stats
        (generate_hapmap_assay_count, {'context': context, 'request': request}),  # 2
        (generate_hapmap_cell_line_file_count, {'context': context, 'request': request}),  # 3

        # iPSC & Fibroblast stats
        (generate_ipsc_assay_count, {'context': context, 'request': request}),  # 4
        (generate_ipsc_cell_line_file_count, {'context': context, 'request': request}),  # 5

        # Tissue stats
        (generate_tissue_file_count, {'context': context, 'request': request}),  # 6
        (generate_tissue_donor_count, {'context': context, 'request': request}),  # 7
        (generate_tissue_assay_count, {'context': context, 'request': request}),  # 8

        # Production stats
        (generate_production_file_count, {'context': context, 'request': request}),  # 9
        (generate_production_tissue_donor_count, {'context': context, 'request': request}),  # 10
        (generate_production_tissue_assay_count, {'context': context, 'request': request}),  # 11
        (generate_production_tissue_type_count, {'context': context, 'request': request}),  # 12
    ])
    time = datetime.now(timezone('EST'))
    response = {
        '@context': '/home',
        '@id': '/home',
        'date': f'{time.strftime("%Y-%m-%d %H:%M")} EST',
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
                            { "value": search_results[0],
                              "unit": "Assays" },
                            { "value": 0, "unit": "Mutations" },
                            { "value": search_results[1],
                              "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "HapMap Cell Line",
                        "link": "/data/benchmarking/HapMap",
                        "figures": [
                            { "value": 6, "unit": "Cell Lines" },
                            { "value": search_results[2], "unit": "Assays" },
                            { "value": 0, "unit": "Mutations" },
                            { "value": search_results[3], "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "iPSC & Fibroblasts",
                        "link": "/data/benchmarking/iPSC-fibroblasts",
                        "figures": [
                            { "value": 5, "unit": "Cell Lines" },
                            { "value": search_results[4], "unit": "Assays" },
                            { "value": 0, "unit": "Mutations" },
                            { "value": search_results[5], "unit": "Files Generated" }
                        ]
                    },
                    {
                        "title": "Benchmarking Tissues",
                        "link": "/data/benchmarking/donor-st001",
                        "figures": [
                            { "value": search_results[7], "unit": "Donors" },
                            { "value": 4, "unit": "Tissue Types" },
                            { "value": search_results[8], "unit": "Assays" },
                            { "value": search_results[6], "unit": "Files Generated" }
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
                            { "value": search_results[10], "unit": "Donors" },
                            { "value": search_results[12], "unit": "Tissue Types" },
                            { "value": search_results[11], "unit": "Assays" },
                            { "value": search_results[9], "unit": "Files Generated" }
                        ]
                    }
                ]
            },
        ]
    }
    return response
