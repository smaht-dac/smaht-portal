# import uuid
#
# from botocore.exceptions import ClientError
from copy import copy, deepcopy
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
# from dcicutils.misc_utils import print_error_message
from pyramid.httpexceptions import HTTPBadRequest
from pyramid.view import view_config
# from snovault import CONNECTION
from snovault.util import debug_log
from snovault.search.search import (
    search as perform_search_request, 
    make_search_subreq
)
from urllib.parse import urlencode
import json
#
# from .types.base import SMAHTItem
# from snovault.types.base import get_item_or_none
# from encoded_core.types.workflow import (
#     trace_workflows,
#     DEFAULT_TRACING_OPTIONS,
#     WorkflowRunTracingException,
#     item_model_to_object
# )
# from snovault.util import make_s3_client
#
#
TERM_NAME_FOR_NO_VALUE = "No value"

# Common definition for aggregating all files **counts**.
# This works four our ElasticSearch mapping though has some non-ideal-ities.
# For example, we use "cardinality" instead of "value_count" agg (which would (more correctly) count duplicate files, etc.)
SUM_FILES_AGGREGATION_DEFINITION = {
    "total_files": {
        "cardinality": {
            "field": "embedded.accession.raw",
            "precision_threshold": 10000
        }
    }
}

FIELDS_TO_DELETE = ['@context', '@id', '@type', '@graph', 'title', 'filters', 'facets', 'sort', 'clear_filters', 'actions', 'columns']


def includeme(config):
    config.add_route('date_histogram_aggregations', '/date_histogram_aggregations/')
    config.add_route('bar_plot_chart',              '/bar_plot_aggregations')
    config.add_route('data_matrix_aggregations',    '/data_matrix_aggregations')
    config.scan(__name__)


@view_config(route_name='date_histogram_aggregations', request_method=['GET', 'POST'])
@debug_log
def date_histogram_aggregations(context, request):
    '''PREDEFINED aggregations which run against type=File'''

    # Defaults - may be overriden in URI params
    date_histogram_fields = ['file_status_tracking.uploading', 'file_status_tracking.uploaded', 'file_status_tracking.released']
    group_by_fields = [
        'data_generation_summary.submission_centers', 'data_generation_summary.sequencing_center', 
        'data_generation_summary.data_type', 'data_generation_summary.data_category', 'file_format.display_title',
        'data_generation_summary.assays', 
        'data_generation_summary.sequencing_platforms', 'dataset', 'software.display_title'
        ]
    date_histogram_intervals = ['weekly']

    # Mapping of 'date_histogram_interval' options we accept to ElasticSearch interval vocab term.
    interval_to_es_interval = {
        'hourly': 'hour',
        'daily': 'day',
        'weekly': 'week',
        'monthly': 'month',
        'yearly': 'year'
    }

    date_from, date_to = None, None
    try:
        json_body = request.json_body
        search_param_lists = json_body.get('search_query_params', {})
    except Exception:
        search_param_lists = request.GET.dict_of_lists()
        if 'group_by' in search_param_lists:
            group_by_fields = search_param_lists['group_by']
            del search_param_lists['group_by']  # We don't wanna use it as search filter.
            if len(group_by_fields) == 1 and group_by_fields[0] in ['None', 'null']:
                group_by_fields = None
        if 'date_histogram' in search_param_lists:
            date_histogram_fields = search_param_lists['date_histogram']
            del search_param_lists['date_histogram']  # We don't wanna use it as search filter.
        if 'date_histogram_interval' in search_param_lists:
            date_histogram_intervals = search_param_lists['date_histogram_interval']
            for interval in date_histogram_intervals:
                if interval not in interval_to_es_interval.keys():
                    raise IndexError('"{}" is not one of daily, weekly, monthly, or yearly.'.format(interval))
            del search_param_lists['date_histogram_interval']  # We don't wanna use it as search filter.
        if 'date_range' in search_param_lists and len(search_param_lists['date_range']) > 0:
            date_range = search_param_lists['date_range'][0]
            date_from, date_to = convert_date_range(date_range)
            for dh_field in date_histogram_fields:
                if date_from is not None:
                    search_param_lists['{}.from'.format(dh_field)] = date_from.strftime("%Y-%m-%d")
                if date_to is not None:
                    search_param_lists['{}.to'.format(dh_field)] = date_to.strftime("%Y-%m-%d")
            del search_param_lists['date_range']
        if not search_param_lists:
            search_param_lists = {}

    if 'type' in search_param_lists and ('SubmittedFile' in search_param_lists['type'] or 'File' in search_param_lists['type']):
        common_sub_agg = deepcopy(SUM_FILES_AGGREGATION_DEFINITION)

        # Add on file_size_volume
        for key_name in ['total_files']:
            common_sub_agg[key_name + "_volume"] = {
                "sum": {
                    "field": common_sub_agg[key_name]["cardinality"]["field"].replace('.accession.raw', '.file_size')
                }
            }

        if group_by_fields is not None:
            group_by_agg_dict = {
                group_by_field: {
                    "terms": {
                        "field": "embedded." + group_by_field + ".raw",
                        "missing": TERM_NAME_FOR_NO_VALUE,
                        "size": 30
                    },
                    "aggs": common_sub_agg
                }
                for group_by_field in group_by_fields if group_by_field is not None
            }
            histogram_sub_aggs = dict(common_sub_agg, **group_by_agg_dict)
        else:
            histogram_sub_aggs = common_sub_agg

    else:
        if group_by_fields is not None:
            # Do simple date_histogram group_by sub agg, unless is set to 'None'
            histogram_sub_aggs = {
                group_by_field: {
                    "terms": {
                        "field": "embedded." + group_by_field + ".raw",
                        "missing": TERM_NAME_FOR_NO_VALUE,
                        "size": 30
                    }
                }
                for group_by_field in group_by_fields if group_by_field is not None
            }
        else:
            histogram_sub_aggs = None

    # Create an agg item for each interval in `date_histogram_intervals` x each date field in `date_histogram_fields`
    # TODO: Figure out if we want to align these up instead of do each combination.
    outer_date_histogram_agg = {}
    for interval in date_histogram_intervals:
        for dh_field in date_histogram_fields:
            date_histogram = {
                "field": "embedded." + dh_field,
                "interval": interval_to_es_interval[interval],
                "format": "yyyy-MM-dd"
            }
            outer_date_histogram_agg[interval + '_interval_' + dh_field] = {
                "date_histogram": date_histogram
            }
            if histogram_sub_aggs:
                outer_date_histogram_agg[interval + '_interval_' + dh_field]['aggs'] = histogram_sub_aggs

    search_param_lists['limit'] = search_param_lists['from'] = [0]
    subreq = make_search_subreq(request, '{}?{}'.format('/search/', urlencode(search_param_lists, True)))
    search_result = perform_search_request(None, subreq, custom_aggregations=outer_date_histogram_agg)

    # remove unnecessary fields from result
    for field_to_delete in FIELDS_TO_DELETE:
        if search_result.get(field_to_delete) is None:
            continue
        del search_result[field_to_delete]

    search_result['from_date'] = date_from.strftime("%Y-%m-%d") if date_from is not None else None
    search_result['to_date'] = date_to.strftime("%Y-%m-%d") if date_to is not None else None
    search_result['interval'] = date_histogram_intervals

    return search_result


DATE_RANGE_PRESETS = {
    'all': lambda today: (datetime(2023, 1, 1), today),
    'thismonth': lambda today: (today.replace(day=1), today),
    'previousmonth': lambda today: (today.replace(day=1) - relativedelta(months=1), today.replace(day=1) - relativedelta(days=1)),
    'last3months': lambda today: (today.replace(day=1) - relativedelta(months=2), today),
    'last6months': lambda today: (today.replace(day=1) - relativedelta(months=5), today),
    'last12months': lambda today: (today.replace(day=1) - relativedelta(months=11), today),
    'thisyear': lambda today: (datetime(today.year, 1, 1), datetime(today.year, 12, 31)),
    'previousyear': lambda today: (datetime(today.year - 1, 1, 1), datetime(today.year - 1, 12, 31)),
}


def convert_date_range(date_range_str):
    data_range_split = date_range_str.split('|')
    preset = data_range_split[0]
    
    if preset not in DATE_RANGE_PRESETS and preset != 'custom':
        raise IndexError(f'"{preset}" is not one of {", ".join(DATE_RANGE_PRESETS.keys())} or custom.')

    today = datetime.today()
    date_from, date_to = None, None

    if preset in DATE_RANGE_PRESETS:
        date_from, date_to = DATE_RANGE_PRESETS[preset](today)
    elif preset == 'custom':
        if len(data_range_split) > 1 and data_range_split[1] and len(data_range_split[1]) == 10:
            date_from = datetime.strptime(data_range_split[1], '%Y-%m-%d')
        if len(data_range_split) > 2 and data_range_split[2] and len(data_range_split[2]) == 10:
            date_to = datetime.strptime(data_range_split[2], '%Y-%m-%d')

    return [date_from, date_to]


@view_config(route_name='bar_plot_chart', request_method=['GET', 'POST'])
@debug_log
def bar_plot_chart(context, request):

    MAX_BUCKET_COUNT = 30  # Max amount of bars or bar sections to return, excluding 'other'.
    DEFAULT_BROWSE_PARAM_LISTS = {'type': ['SubmittedFile']}
    SUM_FILES_EXPS_AGGREGATION_DEFINITION = {}

    try:
        json_body = request.json_body
        search_param_lists = json_body.get('search_query_params', deepcopy(DEFAULT_BROWSE_PARAM_LISTS))
        fields_to_aggregate_for = json_body.get('fields_to_aggregate_for', request.params.getall('field'))
    except json.decoder.JSONDecodeError:
        search_param_lists = request.GET.dict_of_lists()
        fields_to_aggregate_for = request.params.getall('field')

    if len(fields_to_aggregate_for) == 0:
        raise HTTPBadRequest(detail="No fields supplied to aggregate for.")

    primary_agg = {
        "field_0": {
            "terms": {
                "field": "embedded." + fields_to_aggregate_for[0] + '.raw',
                "missing": TERM_NAME_FOR_NO_VALUE,
                "size": MAX_BUCKET_COUNT
            },
            "aggs": deepcopy(SUM_FILES_EXPS_AGGREGATION_DEFINITION)
        }
    }

    primary_agg.update(deepcopy(SUM_FILES_EXPS_AGGREGATION_DEFINITION))

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
            "aggs": deepcopy(SUM_FILES_EXPS_AGGREGATION_DEFINITION)
        }
        curr_field_aggs = curr_field_aggs['field_' + str(field_index)]['aggs']

    search_param_lists['limit'] = search_param_lists['from'] = [0]
    subreq = make_search_subreq(request, '{}?{}'.format('/search/', urlencode(search_param_lists, True)))
    search_result = perform_search_request(None, subreq, custom_aggregations=primary_agg)

    for field_to_delete in FIELDS_TO_DELETE:
        if search_result.get(field_to_delete) is None:
            continue
        del search_result[field_to_delete]

    ret_result = {  # We will fill up the "terms" here from our search_result buckets and then return this dictionary.
        "field": fields_to_aggregate_for[0],
        "terms": {},
        "total": {
            "files": search_result['total'],
        },
        "other_doc_count": search_result['aggregations']['field_0'].get('sum_other_doc_count', 0),
        "time_generated": str(datetime.utcnow())
    }

    def format_bucket_result(bucket_result, returned_buckets, curr_field_depth=0):

        curr_bucket_totals = {
            'files': int(bucket_result['doc_count'])
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
        format_bucket_result(bucket, ret_result['terms'], 0)

    return ret_result


@view_config(route_name='data_matrix_aggregations', request_method=['POST'])
@debug_log
def data_matrix_aggregations(context, request):

    MAX_BUCKET_COUNT = 30  # Max amount of bars or bar sections to return, excluding 'other'.
    DEFAULT_BROWSE_PARAM_LISTS = {'type': ['SubmittedFile']}
    SUM_FILES_EXPS_AGGREGATION_DEFINITION = {}

    try:
        json_body = request.json_body
        search_param_lists = json_body.get('search_query_params', deepcopy(DEFAULT_BROWSE_PARAM_LISTS))
        # fields_to_aggregate_for = json_body.get('fields_to_aggregate_for', request.params.getall('field'))
        column_agg_fields = json_body.get('column_agg_fields')
        if isinstance(column_agg_fields, str):
            column_agg_fields = [column_agg_fields]
        row_agg_fields = json_body.get('row_agg_fields')
        flatten_values = json_body.get('flatten_values', False)
    except json.decoder.JSONDecodeError:
        raise HTTPBadRequest(detail="No fields supplied to aggregate for.")

    if column_agg_fields is None or len(column_agg_fields) == 0 or row_agg_fields is None or len(row_agg_fields) == 0:
        raise HTTPBadRequest(detail="No fields supplied to aggregate for.")

    def get_es_key(field_or_field_list):
        return "script" if isinstance(field_or_field_list, list) and len(field_or_field_list) > 1 else "field"

    def get_es_key_value(field_or_field_list):
        if isinstance(field_or_field_list, list) and len(field_or_field_list) > 1:
            return {
                "source": " + ' - ' + ".join(["doc['embedded." + field + ".raw'].value" for field in field_or_field_list]),
                "lang": "painless"
            }
        else:
            return "embedded." + (field_or_field_list[0] if isinstance(field_or_field_list, list) else field_or_field_list) + '.raw'

    primary_agg = {
        "field_0": {
            "terms": {
                get_es_key(column_agg_fields): get_es_key_value(column_agg_fields),
                "missing": TERM_NAME_FOR_NO_VALUE,
                "size": MAX_BUCKET_COUNT
            },
            "aggs": deepcopy(SUM_FILES_EXPS_AGGREGATION_DEFINITION)
        }
    }

    primary_agg.update(deepcopy(SUM_FILES_EXPS_AGGREGATION_DEFINITION))

    # Nest in additional fields, if any
    curr_field_aggs = primary_agg['field_0']['aggs']
    for field_index, field in enumerate(row_agg_fields):
        curr_field_aggs["field_" + str(field_index + 1)] = {
            "terms": {
                get_es_key(field): get_es_key_value(field),
                "missing": TERM_NAME_FOR_NO_VALUE,
                "size": MAX_BUCKET_COUNT
            },
            "aggs": deepcopy(SUM_FILES_EXPS_AGGREGATION_DEFINITION)
        }
        curr_field_aggs = curr_field_aggs['field_' + str(field_index + 1)]['aggs']

    search_param_lists['limit'] = search_param_lists['from'] = [0]
    subreq = make_search_subreq(request, '{}?{}'.format('/search/', urlencode(search_param_lists, True)))
    search_result = perform_search_request(None, subreq, custom_aggregations=primary_agg)

    for field_to_delete in FIELDS_TO_DELETE:
        if search_result.get(field_to_delete) is None:
            continue
        del search_result[field_to_delete]

    ret_result = {  # We will fill up the "terms" here from our search_result buckets and then return this dictionary.
        "field": column_agg_fields[0] if isinstance(column_agg_fields, list) else column_agg_fields,
        "terms": {},
        "total": {
            "files": search_result['total'],
        },
        "other_doc_count": search_result['aggregations']['field_0'].get('sum_other_doc_count', 0),
        "time_generated": str(datetime.utcnow())
    }

    def format_bucket_result(bucket_result, returned_buckets, curr_field_depth=0):

        curr_bucket_totals = {
            'files': int(bucket_result['doc_count'])
        }

        next_field_name = None
        if len(row_agg_fields) > curr_field_depth:  # More fields agg results to add
            next_field_name = row_agg_fields[curr_field_depth]
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
        format_bucket_result(bucket, ret_result['terms'], 0)

    def flatten_es_terms_aggregation(es_response):
        result = []

        def recurse_terms(level, path, data):
            if "terms" in data:
                # Get the field name at the current level (or fallback to a generic name)
                field_name = data.get("field", f"level_{level}")
                for term_value, term_data in data["terms"].items():
                    # Recursively process the next level, appending current field and value to the path
                    recurse_terms(level + 1, path + [(field_name, term_value)], term_data)
            elif "files" in data:
                # When the deepest level is reached, build a flat record from the path
                flat_record = {field: value for field, value in path}
                flat_record["files"] = data["files"]
                result.append(flat_record)

        # Start recursion from the root
        recurse_terms(0, [], es_response)
        return result

    return flatten_es_terms_aggregation(ret_result) if flatten_values else ret_result
