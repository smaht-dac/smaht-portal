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
    config.add_route('bar_plot_chart', '/bar_plot_aggregations/')
    config.add_route('data_matrix_aggregations', '/data_matrix_aggregations/')
    config.scan(__name__)


@view_config(route_name='date_histogram_aggregations', request_method=['GET', 'POST'])
@debug_log
def date_histogram_aggregations(context, request):
    '''PREDEFINED aggregations which run against type=File'''

    # Defaults - may be overriden in URI params
    date_histogram_fields = [
        "file_status_tracking.status_tracking.uploading",
        "file_status_tracking.status_tracking.uploaded",
        "file_status_tracking.release_dates.initial_release",
    ]
    group_by_fields = [
        "data_generation_summary.submission_centers",
        "data_generation_summary.sequencing_center",
        "data_generation_summary.data_type",
        "data_generation_summary.data_category",
        "file_format.display_title",
        "data_generation_summary.assays",
        "data_generation_summary.sequencing_platforms",
        "dataset",
        "software.display_title",
    ]
    date_histogram_intervals = ["weekly"]

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
    DEFAULT_BROWSE_PARAM_LISTS = {
        'type': ['File'],
        'sample_summary.studies': ['Production'],
        'status': ['released']
    }
    SUM_AGGREGATION_DEFINITION = {
        "total_donors": {
            "cardinality": {
                "field": "embedded.donors.display_title.raw",
                "precision_threshold": 10000
            }
        },
        "total_tissues": {
            "cardinality": {
                "field": "embedded.sample_summary.tissues.raw",
                "precision_threshold": 10000
            }
        },
        "total_assays": {
            "cardinality": {
                "field": "embedded.file_sets.libraries.assay.display_title.raw",
                "precision_threshold": 10000
            }
        },
        "total_file_size": {
            "sum": {
                "field": "embedded.file_size"
            }
        },
        "all_donors_ids": {
            "terms": {
                "field": "embedded.donors.display_title.raw",
                "size": 10000,
                "order": { "_key": "asc" }
            }
        }
    }

    isFileTypeSearch = False
    try:
        json_body = request.json_body
        search_param_lists = json_body.get('search_query_params', deepcopy(DEFAULT_BROWSE_PARAM_LISTS))
        fields_to_aggregate_for = json_body.get('fields_to_aggregate_for', request.params.getall('field'))

        if 'type' in search_param_lists and (
            (isinstance(search_param_lists['type'], list) and 'File' in search_param_lists['type'] and len(search_param_lists['type']) == 1) or
            (isinstance(search_param_lists['type'], str) and search_param_lists['type'] == 'File')):
            isFileTypeSearch = True
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
            "aggs": deepcopy(SUM_AGGREGATION_DEFINITION)
        }
    }

    primary_agg.update(deepcopy(SUM_AGGREGATION_DEFINITION))

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
            "aggs": deepcopy(SUM_AGGREGATION_DEFINITION)
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
            "doc_count": search_result['total'],
            "files": search_result['total'] if isFileTypeSearch else 0,
            "donors": search_result['aggregations']['total_donors']['value'],
            "assays": search_result['aggregations']['total_assays']['value'],
            "tissues": search_result['aggregations']['total_tissues']['value'],
            "file_size": search_result['aggregations']['total_file_size']['value'],
            "all_donors_ids": [b["key"] for b in search_result["aggregations"]["all_donors_ids"]["buckets"]]
        },
        "other_doc_count": search_result['aggregations']['field_0'].get('sum_other_doc_count', 0),
        "time_generated": str(datetime.utcnow())
    }

    def format_bucket_result(bucket_result, returned_buckets, curr_field_depth=0):

        curr_bucket_totals = {
            'doc_count': int(bucket_result['doc_count']),
            "files": int(bucket_result['doc_count']) if isFileTypeSearch else 0,
            'donors': int(bucket_result['total_donors']['value']),
            'all_donors_ids': [b['key'] for b in bucket_result['all_donors_ids']['buckets']]
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

    MAX_BUCKET_COUNT = 30  # Max grouping in a data matrix.
    DEFAULT_SEARCH_PARAM_LISTS = {'type': ['File']}
    DEFAULT_VALUE_DELIMITER = ' '
    # Set of field names whose array values should be concatenated into a single key during data matrix aggregation (e.g., {'data_type'}).
    # Used to determine which fields require special handling for array concatenation in Elasticsearch aggregations.
    ARRAY_FIELDS_TO_JOIN = {
        'data_type'
    }
    SUM_DATA_GENERATION_SUMMARY_AGGREGATION_DEFINITION = {
        "total_coverage": {
            "sum": {
                "script": {
                    "source": """
                        if (doc['embedded.data_generation_summary.average_coverage.raw'].size() == 0) {
                            return 0;
                        } else {
                            return Double.parseDouble(doc['embedded.data_generation_summary.average_coverage.raw'].value);
                        }
                    """
                }
            }
        }
    }
    EXTRA_TOTAL_AGGREGATIONS = [
        { 'aggregation_field': 'donors.external_id', 'result_field': 'donors' }
    ]

    try:
        json_body = request.json_body
        search_param_lists = json_body.get('search_query_params', deepcopy(DEFAULT_SEARCH_PARAM_LISTS))
        column_agg_fields_orig = json_body.get('column_agg_fields')
        # always make column_agg_fields_orig a list
        if isinstance(column_agg_fields_orig, str):
            column_agg_fields_orig = [column_agg_fields_orig]
        row_agg_fields_orig = json_body.get('row_agg_fields')
        flatten_values = json_body.get('flatten_values', False)
        value_delimiter = json_body.get('value_delimiter', DEFAULT_VALUE_DELIMITER)
    except json.decoder.JSONDecodeError:
        raise HTTPBadRequest(detail="No fields supplied to aggregate for.")

    if column_agg_fields_orig is None or len(column_agg_fields_orig) == 0 or row_agg_fields_orig is None or len(row_agg_fields_orig) == 0:
        raise HTTPBadRequest(detail="No fields supplied to aggregate for.")

    def flatten(items):
        for item in items:
            if isinstance(item, str):
                yield item
            elif isinstance(item, list):
                yield from flatten(item)

    # 1. flatten if any composite keys exists: ["row1", ["row2-1", "row2-2"], "row3"] --> ["row1", "row2-1", "row2-2", "row3"]
    row_agg_fields = list(flatten(row_agg_fields_orig))

    # 2. get the first column_agg_fields and use it as the primary field for the aggregation
    column_agg_fields = column_agg_fields_orig[:1]

    # 3. insert the remaining column_agg_fields into the row_agg_fields
    remaining_columns = column_agg_fields_orig[1:]
    row_agg_fields = remaining_columns + row_agg_fields
    row_totals_es_agg_start_index = len(remaining_columns)

    def is_array_concat_field(field):
        return isinstance(field, str) and field in ARRAY_FIELDS_TO_JOIN

    def get_es_key(field_or_field_list):
        """
        Returns 'script' if field_or_field_list is an array concat field or a
        list with more than one item; otherwise returns 'field'.
        """
        return "script" if (is_array_concat_field(field_or_field_list) or (isinstance(field_or_field_list, list) and len(field_or_field_list) > 1)) else "field"

    def get_es_value(field_or_field_list):
        """
        Returns an Elasticsearch field value or script for the given field or
        list of fields. If multiple fields are provided, returns a script to
        concatenate their values. If the field requires array concatenation,
        returns a script to join sorted values. Otherwise, returns the raw field
        path.
        """
        if isinstance(field_or_field_list, list) and len(field_or_field_list) > 1:
            # If we have multiple fields, we will return a script that concatenates them.
            return {
                "source": f" + '{value_delimiter}' + ".join(["doc['embedded." + field + ".raw'].value" for field in field_or_field_list]),
                "lang": "painless"
            }
        if is_array_concat_field(field_or_field_list):
            field = field_or_field_list
            return {
                "source": (
                    "def values = doc['embedded." + field + ".raw'];"
                    "if (values == null || values.size() == 0) { return params.missing; }"
                    "def sorted = new ArrayList(values);"
                    "Collections.sort(sorted);"
                    "return String.join(params.sep, sorted);"
                ),
                "lang": "painless",
                "params": {
                    "missing": TERM_NAME_FOR_NO_VALUE,
                    "sep": ' | '
                }
            }
        return "embedded." + (field_or_field_list[0] if isinstance(field_or_field_list, list) else field_or_field_list) + '.raw'

    def build_extra_total_aggs():
        extra_aggs = {}
        for extra_agg in EXTRA_TOTAL_AGGREGATIONS:
            aggregation_field = extra_agg.get('aggregation_field')
            result_field = extra_agg.get('result_field')
            if not aggregation_field or not result_field:
                continue
            extra_aggs[result_field] = {
                "cardinality": {
                    "field": f"embedded.{aggregation_field}.raw"
                }
            }
        return extra_aggs

    extra_total_aggs = build_extra_total_aggs()

    primary_agg = {
        "field_0": {
            "terms": {
                get_es_key(column_agg_fields): get_es_value(column_agg_fields),
                "missing": TERM_NAME_FOR_NO_VALUE,
                "size": MAX_BUCKET_COUNT
            },
            "aggs": deepcopy(SUM_DATA_GENERATION_SUMMARY_AGGREGATION_DEFINITION)
        },
        "row_totals_0": {
            "terms": {
                get_es_key(row_agg_fields[row_totals_es_agg_start_index]): get_es_value(row_agg_fields[row_totals_es_agg_start_index]),
                "missing": TERM_NAME_FOR_NO_VALUE,
                "size": MAX_BUCKET_COUNT
            },
            "aggs": {}
        }
    }
    if extra_total_aggs:
        primary_agg["field_0"]["aggs"] = {
            **primary_agg["field_0"]["aggs"],
            **deepcopy(extra_total_aggs)
        }
        primary_agg["row_totals_0"]["aggs"] = {
            **primary_agg["row_totals_0"]["aggs"],
            **deepcopy(extra_total_aggs)
        }
        primary_agg.update(deepcopy(extra_total_aggs))

    def build_nested_aggs(primary_agg, agg_fields, base_aggregation_def, primary_field_prefix="field_0", field_prefix="field_"):
        """
        Dynamically builds nested Elasticsearch aggregations structure.

        Args:
            primary_agg (dict): Base aggregation dict with initial structure.
            row_agg_fields (list): List of fields to aggregate by.
            base_aggregation_def (dict): Template for nested aggregation (e.g., sum or metrics definition).
            primary_field_prefix (str): Key path in `primary_agg` to start from (default: "field_0").
            field_prefix (str): Prefix for dynamically generated field names (default: "field_").

        Returns:
            dict: Updated aggregation dictionary with nested fields.
        """
        curr_field_aggs = primary_agg[primary_field_prefix]['aggs']

        for field_index, field in enumerate(agg_fields):
            field_key = f"{field_prefix}{field_index + 1}"
            curr_field_aggs[field_key] = {
                "terms": {
                    get_es_key(field): get_es_value(field),
                    "missing": TERM_NAME_FOR_NO_VALUE,
                    "size": MAX_BUCKET_COUNT
                },
                "aggs": deepcopy(base_aggregation_def)
            }
            curr_field_aggs = curr_field_aggs[field_key]['aggs']

        return primary_agg

    # Nest in additional fields, if any
    base_aggregation_def = {
        **deepcopy(SUM_DATA_GENERATION_SUMMARY_AGGREGATION_DEFINITION),
        **deepcopy(extra_total_aggs)
    }
    build_nested_aggs(primary_agg, row_agg_fields, base_aggregation_def, "field_0", "field_")
    # Nest row totals aggregation
    if len(row_agg_fields) > row_totals_es_agg_start_index + 1:
        build_nested_aggs(primary_agg, row_agg_fields[row_totals_es_agg_start_index + 1:], deepcopy(extra_total_aggs), "row_totals_0", "row_totals_")

    search_param_lists['limit'] = search_param_lists['from'] = [0]
    subreq = make_search_subreq(request, '{}?{}'.format('/search/', urlencode(search_param_lists, True)))
    # import pdb; pdb.set_trace()
    search_result = perform_search_request(None, subreq, custom_aggregations=primary_agg)

    for field_to_delete in FIELDS_TO_DELETE:
        if search_result.get(field_to_delete) is None:
            continue
        del search_result[field_to_delete]

    ret_result = {  # We will fill up the "terms" here from our search_result buckets and then return this dictionary.
        "field": column_agg_fields[0] if isinstance(column_agg_fields, list) else column_agg_fields,
        "terms": {},
        "counts": {
            "files": search_result['total']
        },
        "row_total_field": row_agg_fields[row_totals_es_agg_start_index],
        "row_total_terms": {},
        "other_doc_count": search_result['aggregations']['field_0'].get('sum_other_doc_count', 0),
        "time_generated": str(datetime.utcnow())
    }
    for extra_agg in EXTRA_TOTAL_AGGREGATIONS:
        result_field = extra_agg.get('result_field')
        if not result_field:
            continue
        extra_total = search_result['aggregations'].get(result_field)
        if extra_total and 'value' in extra_total:
            ret_result["counts"][result_field] = int(extra_total['value'])

    def format_bucket_result(bucket_result, returned_buckets, curr_field_depth=0, field_key="field", terms_key="terms", field_prefix="field_", agg_fields=row_agg_fields):
        """
        Formats a nested aggregation result (bucket_result) into a structured
        dictionary (returned_buckets), recursively processing aggregation fields
        and collecting totals for each bucket. Used for hierarchical data
        aggregation, such as Elasticsearch-style bucket results.
        """

        curr_bucket_counts = {
            'files': int(bucket_result['doc_count']),
            'total_coverage': bucket_result['total_coverage']['value'] if 'total_coverage' in bucket_result and bucket_result['total_coverage'] else 0
        }
        for extra_agg in EXTRA_TOTAL_AGGREGATIONS:
            result_field = extra_agg.get('result_field')
            if not result_field:
                continue
            extra_total = bucket_result.get(result_field)
            if extra_total and 'value' in extra_total:
                curr_bucket_counts[result_field] = int(extra_total['value'])

        next_field_name = None
        if len(agg_fields) > curr_field_depth:  # More fields agg results to add
            next_field_name = agg_fields[curr_field_depth]
            returned_buckets[bucket_result['key']] = {
                "term": bucket_result['key'],
                field_key: next_field_name[0] if isinstance(next_field_name, list) else next_field_name,
                "counts": curr_bucket_counts,
                terms_key: {},
                "other_doc_count": bucket_result[field_prefix + str(curr_field_depth + 1)].get('sum_other_doc_count', 0),
            }
            for bucket in bucket_result[field_prefix + str(curr_field_depth + 1)]['buckets']:
                format_bucket_result(bucket, returned_buckets[bucket_result['key']][terms_key], curr_field_depth + 1, field_key, terms_key, field_prefix, agg_fields)

        else:
            # Terminal field aggregation -- return just totals, nothing else.
            returned_buckets[bucket_result['key']] = {
                "counts": curr_bucket_counts
            }

    for bucket in search_result['aggregations']['field_0']['buckets']:
        format_bucket_result(bucket, ret_result['terms'], 0)
    for bucket in search_result['aggregations']['row_totals_0']['buckets']:
        format_bucket_result(bucket, ret_result['row_total_terms'], 0, "row_total_field", "row_total_terms", "row_totals_", row_agg_fields[row_totals_es_agg_start_index + 1:])

    def flatten_es_terms_aggregation(es_response, field_key="field", terms_key="terms"):
        """
        Flattens a nested Elasticsearch terms aggregation response into a list
        of dictionaries, where each dictionary represents a unique path of term
        values and associated file data. Accepts custom keys for field and terms
        extraction.
        """
        result = []

        def recurse_terms(level, path, data):
            if terms_key in data:
                # Get the field name at the current level (or fallback to a generic name)
                field_name = data.get(field_key, f"level_{level}")
                for term_value, term_data in data[terms_key].items():
                    # Recursively process the next level, appending current field and value to the path
                    recurse_terms(level + 1, path + [(field_name, term_value)], term_data)
            elif "counts" in data:
                # When the deepest level is reached, build a flat record from the path
                flat_record = {field: value for field, value in path}
                flat_record["counts"] = data["counts"]
                result.append(flat_record)

        # Start recursion from the root
        recurse_terms(0, [], es_response)
        return result

    if flatten_values:
        # Flatten the nested terms aggregation into a list of dictionaries
        # where each dictionary represents a unique combination of terms and their file counts.
        data = flatten_es_terms_aggregation(ret_result)
        row_totals = flatten_es_terms_aggregation(ret_result, "row_total_field", "row_total_terms")
        
        def make_composite(data_array, skip_column_agg=False):
            """
            Aggregates specified fields in each item of data_array by joining their
            values with a delimiter, optionally skipping column-based aggregation if
            skip_column_agg is True. Modifies data_array in place.
            """
            if len(column_agg_fields_orig) > 1 and not skip_column_agg:
                for item in data_array:
                    if all(field in item for field in column_agg_fields_orig):
                        item[column_agg_fields_orig[0]] = value_delimiter.join(
                            [item[field] for field in column_agg_fields_orig]
                    )
            for item in data_array:
                for agg_field in row_agg_fields_orig:
                    if isinstance(agg_field, list):
                        if all(field in item for field in agg_field):
                            item[agg_field[0]] = value_delimiter.join(
                            [item[field] for field in agg_field]
                            )
        
        make_composite(data)
        make_composite(row_totals, True)

        ret_result = {
            "column_agg_fields": column_agg_fields_orig,
            "row_agg_fields": row_agg_fields_orig,
            "data": data,
            "row_totals": row_totals,
            "counts": ret_result["counts"],
            "time_generated": ret_result["time_generated"],
            "flatten_values": True,
            "value_delimiter": value_delimiter,
            "search_params": search_param_lists
        }    

    return ret_result
