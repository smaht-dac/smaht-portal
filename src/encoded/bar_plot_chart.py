from pyramid.view import view_config
from pyramid.httpexceptions import HTTPBadRequest
from snovault.util import debug_log
from copy import (
    deepcopy
)
import json
from urllib.parse import (
    urlencode,
)
from datetime import datetime
from snovault.search.search_utils import (
    make_search_subreq
)
from snovault.search.search import search as perform_search


def includeme(config):
    config.add_route('bar_plot_chart', '/bar_plot_aggregations')
    config.scan(__name__)


# Constants necessary
TERM_NAME_FOR_NO_VALUE = "No value"
MAX_BUCKET_COUNT = 30  # Max amount of bars or bar sections to return, excluding 'other'.
DEFAULT_BROWSE_PARAM_LISTS = {  # just search on file set for now
    'type': ['FileSet']
}


# Base aggregation, always the same - aggregate on the following things on file set
#   1. Total files on all file sets
#   2. Total different libraries on all file sets
#   3. Total different assays on all file sets
#   4. Total different analytes on all file sets
#   5. Total different samples on all file sets
#   6. Total different sequencers on all file sets
SUM_FILES_FILE_SET_AGGREGATION = {
    "total_files": {
        "cardinality": {
            "field": "embedded.files.display_title.raw"
        }
    },
    "total_libraries": {
        "cardinality": {
            "field": "embedded.libraries.display_title.raw"
        }
    },
    "total_assays": {
        "cardinality": {
            "field": "embedded.libraries.assay.code.raw"
        }
    },
    "total_analytes": {
        "cardinality": {
            "field": "embedded.libraries.analytes.display_title.raw"
        }
    },
    "total_samples": {
        "cardinality": {
            "field": "embedded.libraries.analytes.samples.display_title.raw"
        }
    },
    "total_sequencers": {
        "cardinality": {
            "field": "embedded.sequencing.sequencer.identifier.raw"
        }
    }
}


@view_config(route_name='bar_plot_chart', request_method=['GET', 'POST'])
@debug_log
def bar_plot_chart(context, request):
    """ API that returns response structure necessary to populate the bar plot chart, similar to 4DN but not
        quite as complex
    """
    try:
        json_body = request.json_body
        search_param_lists = json_body.get('search_query_params', deepcopy(DEFAULT_BROWSE_PARAM_LISTS))
        fields_to_aggregate_for = json_body.get('fields_to_aggregate_for', request.params.getall('field'))
    except json.decoder.JSONDecodeError:
        search_param_lists = deepcopy(DEFAULT_BROWSE_PARAM_LISTS)
        del search_param_lists['award.project']
        fields_to_aggregate_for = request.params.getall('field')

    if len(fields_to_aggregate_for) == 0:
        raise HTTPBadRequest(detail="No fields supplied to aggregate for.")

    # Setup base aggregation
    primary_agg = {
        "field_0": {
            "terms": {
                "field": "embedded." + fields_to_aggregate_for[0] + '.raw',
                "missing": TERM_NAME_FOR_NO_VALUE,
                "size": MAX_BUCKET_COUNT
            },
            "aggs": deepcopy(SUM_FILES_FILE_SET_AGGREGATION)
        },
    }
    primary_agg.update(deepcopy(SUM_FILES_FILE_SET_AGGREGATION))

    # Nest in additional fields, if any
    curr_field_aggs = primary_agg['field_0']['aggs']
    for field_index, field in enumerate(fields_to_aggregate_for):
        if field_index == 0:
            continue
        curr_field_aggs["field_" + str(field_index)] = {
            "terms": {
                "field": "embedded." + field + '.raw',
                "missing": TERM_NAME_FOR_NO_VALUE,
                "size": MAX_BUCKET_COUNT
            },
            "aggs": deepcopy(SUM_FILES_FILE_SET_AGGREGATION)
        }
        curr_field_aggs = curr_field_aggs['field_' + str(field_index)]['aggs']

    # Search setup request
    search_param_lists['limit'] = search_param_lists['from'] = [0]  # do not extract values, just run aggs
    subreq = make_search_subreq(request, '{}?{}'.format('/search/', urlencode(search_param_lists, True)))
    search_result = perform_search(None, subreq, custom_aggregations=primary_agg)

    # Grab count, initialize result object - most are grabbed directly from result
    result = {
        "field": fields_to_aggregate_for[0],
        "terms": {},
        "total": {
            "total_file_sets": search_result['total'],
            "total_files": search_result['aggregations']['total_files']['value'],
            "total_libraries": search_result['aggregations']['total_libraries']['value'],
            "total_assays": search_result['aggregations']['total_assays']['value'],
            "total_analytes": search_result['aggregations']['total_analytes']['value'],
            "total_samples": search_result['aggregations']['total_samples']['value'],
            "total_sequencers": search_result['aggregations']['total_sequencers']['value'],
        },
        "time_generated": str(datetime.utcnow())
    }

    # Helper function that formats returned_buckets in place in order to structure appropriately for the UI
    # to process and render
    def format_bucket_result(bucket_result, returned_buckets, curr_field_depth=0):

        curr_bucket_totals = {
            'file_sets': int(bucket_result['doc_count']),
            'files': int(bucket_result['total_files']['value']),
            'libraries': int(bucket_result['total_libraries']['value']),
            'assays': int(bucket_result['total_assays']['value']),
            'analytes': int(bucket_result['total_analytes']['value']),
            'samples': int(bucket_result['total_samples']['value']),
            'sequencers': int(bucket_result['total_sequencers']['value'])
        }

        next_field_name = None
        if len(fields_to_aggregate_for) > curr_field_depth + 1:  # More fields agg results to add
            next_field_name = fields_to_aggregate_for[curr_field_depth + 1]
            returned_buckets[bucket_result['key']] = {
                "term": bucket_result['key'],
                "field": next_field_name,
                "total": curr_bucket_totals,
                "terms": {},
                "other_doc_count": bucket_result['field_' + str(curr_field_depth + 1)].get('sum_other_doc_count', 0),
            }
            for bucket in bucket_result['field_' + str(curr_field_depth + 1)]['buckets']:
                format_bucket_result(bucket, returned_buckets[bucket_result['key']]['terms'], curr_field_depth + 1)

        else:
            # Terminal field aggregation -- return just totals, nothing else.
            returned_buckets[bucket_result['key']] = curr_bucket_totals

    for bucket in search_result['aggregations']['field_0']['buckets']:
        format_bucket_result(bucket, result['terms'], 0)

    return result
