# import uuid
#
# from botocore.exceptions import ClientError
from copy import copy, deepcopy
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
# from dcicutils.misc_utils import print_error_message
from pyramid.httpexceptions import HTTPBadRequest
from pyramid.view import view_config
from snovault import CONNECTION
from snovault.util import debug_log
from snovault.search.search import (
    search as perform_search_request,
    make_search_subreq
)
from urllib.parse import urlencode
import json
#
from .types.base import Item
# from snovault.types.base import get_item_or_none
from .types.workflow import (
    trace_meta_workflows,
    DEFAULT_TRACING_OPTIONS,
    WorkflowRunTracingException,
    item_model_to_object
)
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

# Coverage sum aggregation for data_matrix_aggregations. The Painless script
# source is request-invariant, so define it once at module scope rather than
# rebuilding the dict on every request. (Elasticsearch itself caches compiled
# scripts keyed by their source string, so identical sources reuse the same
# compiled script across requests.) The definition is deep-copied per request
# before being mutated/nested.
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


def includeme(config):
    config.add_route('trace_meta_workflow_runs', '/trace_meta_workflow_run_steps/{file_uuid}/', traverse='/{file_uuid}')
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
            if len(group_by_fields) == 1 and group_by_fields[0] in ['None', 'None']:
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
    # We discard the default File facets from this response (see FIELDS_TO_DELETE), so skip
    # computing them entirely. The custom date-histogram aggregations still run because
    # snovault gates them on size==0 (which limit=0 gives us), not on facets being present.
    search_param_lists['skip_default_facets'] = ['true']
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


@view_config(route_name='trace_meta_workflow_runs', request_method='GET', permission='view', context=Item)
@debug_log
def trace_meta_workflow_runs(context, request):
    '''
    Traces workflow runs from context (an Item instance), which may be one of the following @types:
    `File`
    Gets @@object representation of files from which to trace, then passes them to `trace_meta_workflow_runs`.
    @@object representation is needed currently because trace_meta_workflow_runs grabs `output_of_workflow_runs` from
    the files and requires them in UUID form. THIS SHOULD BE IMPROVED UPON AT EARLIEST CONVENIENCE.
    Requires that all files and workflow runs which are part of trace be indexed in ElasticSearch, else a
    WorkflowRunTracingException will be thrown.
    URI Paramaters:
        all_runs            If True, will not group similar workflow_runs
        track_performance   If True, will record time it takes for execution
    Returns:
        List of steps (JSON objects) with inputs and outputs representing IO nodes / files.
    '''

    # Default opts += overrides
    options = copy(DEFAULT_TRACING_OPTIONS)
    if request.params.get('all_runs'):
        options['group_similar_workflow_runs'] = False
    if request.params.get('track_performance'):
        options['track_performance'] = True

    item_types = context.jsonld_type()
    item_model_obj = item_model_to_object(context.model, request)

    files_objs_to_trace = []

    if 'File' in item_types:
        files_objs_to_trace.append(item_model_obj)

    elif 'Sample' in item_types:
        for file_uuid in item_model_obj.get('processed_files', []):
            file_model = request.registry[CONNECTION].storage.get_by_uuid(file_uuid)
            file_obj = item_model_to_object(file_model, request)
            files_objs_to_trace.append(file_obj)
        files_objs_to_trace.reverse()

    else:
        raise HTTPBadRequest(detail="This type of Item is not traceable: " + ', '.join(item_types))

    try:
        return trace_meta_workflows(files_objs_to_trace, request, options)
    except WorkflowRunTracingException as e:
        raise HTTPBadRequest(detail=e.args[0])
@view_config(route_name='bar_plot_chart', request_method=['GET', 'POST'])
@debug_log
def bar_plot_chart(context, request):

    MAX_BUCKET_COUNT = 30  # Max amount of bars or bar sections to return, excluding 'other'.
    TISSUE_FIELD = "sample_summary.tissues"
    TISSUE_CATEGORY_FIELD = "sample_summary.category"
    TISSUE_CATEGORY_AGG_NAME = "AGG_tissue_category"
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
                "field": "embedded.assays.display_title.raw",
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
    # Per-bucket aggregations only ever read `total_donors` and `all_donors_ids`
    # (see format_bucket_result); `total_tissues`/`total_assays`/`total_file_size`
    # are consumed only at the top-level total. Computing the full definition at
    # every bucket at every nesting depth wastes ES work, so nest this slim subset.
    PER_BUCKET_AGGREGATION_DEFINITION = {
        "total_donors": SUM_AGGREGATION_DEFINITION["total_donors"],
        "all_donors_ids": SUM_AGGREGATION_DEFINITION["all_donors_ids"],
    }

    isFileTypeSearch = False
    try:
        json_body = request.json_body
        search_param_lists = json_body.get('search_query_params', deepcopy(DEFAULT_BROWSE_PARAM_LISTS))
        fields_to_aggregate_for = json_body.get('fields_to_aggregate_for', request.params.getall('field'))
        include_meta_tissue_categories = json_body.get('include_meta_tissue_categories', False)

        if 'type' in search_param_lists and (
            (isinstance(search_param_lists['type'], list) and 'File' in search_param_lists['type'] and len(search_param_lists['type']) == 1) or
            (isinstance(search_param_lists['type'], str) and search_param_lists['type'] == 'File')):
            isFileTypeSearch = True
    except json.decoder.JSONDecodeError:
        search_param_lists = request.GET.dict_of_lists()
        fields_to_aggregate_for = request.params.getall('field')
        include_meta_tissue_categories = False

    if len(fields_to_aggregate_for) == 0:
        raise HTTPBadRequest(detail="No fields supplied to aggregate for.")

    primary_agg = {
        "field_0": {
            "terms": {
                "field": "embedded." + fields_to_aggregate_for[0] + '.raw',
                "missing": TERM_NAME_FOR_NO_VALUE,
                "size": MAX_BUCKET_COUNT
            },
            "aggs": deepcopy(PER_BUCKET_AGGREGATION_DEFINITION)
        }
    }

    primary_agg.update(deepcopy(SUM_AGGREGATION_DEFINITION))

    # Provide tissue -> category mapping metadata in this response (same request).
    if include_meta_tissue_categories and fields_to_aggregate_for[0] == TISSUE_FIELD:
        primary_agg["field_0"]["aggs"][TISSUE_CATEGORY_AGG_NAME] = {
            "terms": {
                "field": "embedded." + TISSUE_CATEGORY_FIELD + ".raw",
                "missing": TERM_NAME_FOR_NO_VALUE,
                "size": MAX_BUCKET_COUNT
            }
        }

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
            "aggs": deepcopy(PER_BUCKET_AGGREGATION_DEFINITION)
        }
        curr_field_aggs = curr_field_aggs['field_' + str(field_index)]['aggs']

    search_param_lists['limit'] = search_param_lists['from'] = [0]
    # We discard the default File facets from this response (see FIELDS_TO_DELETE), so skip
    # computing them entirely. The custom bar-plot aggregations still run because snovault
    # gates them on size==0 (which limit=0 gives us), not on facets being present.
    search_param_lists['skip_default_facets'] = ['true']
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
        "time_generated": str(datetime.utcnow()),
        "meta": {}
    }

    def format_bucket_result(bucket_result, returned_buckets, curr_field_depth=0):

        # Each bucket carries its own nested `all_donors_ids` sub-aggregation, so
        # the list is extracted once per bucket here (it is not shared across
        # recursion levels and cannot be cached/reused between buckets).
        doc_count = int(bucket_result['doc_count'])
        curr_bucket_totals = {
            'doc_count': doc_count,
            "files": doc_count if isFileTypeSearch else 0,
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

    # Single pass over the top-level buckets: format each bucket and, when
    # requested, extract tissue -> category mappings in the same traversal
    # instead of iterating the bucket list a second time.
    collect_tissue_categories = (
        include_meta_tissue_categories and fields_to_aggregate_for[0] == TISSUE_FIELD
    )
    tissue_category_by_term = {}
    tissue_category_counts_by_term = {}

    for bucket in search_result['aggregations']['field_0']['buckets']:
        format_bucket_result(bucket, ret_result['terms'], 0)

        if not collect_tissue_categories:
            continue
        category_buckets = bucket.get(TISSUE_CATEGORY_AGG_NAME, {}).get('buckets', [])
        if len(category_buckets) == 0:
            continue
        counts_by_category = {}
        best_category = None
        best_count = -1
        for category_bucket in category_buckets:
            category = category_bucket.get('key')
            count = int(category_bucket.get('doc_count', 0))
            if category is None:
                continue
            counts_by_category[category] = count
            if count > best_count:
                best_count = count
                best_category = category
        if len(counts_by_category) > 0:
            tissue_category_counts_by_term[bucket['key']] = counts_by_category
        if best_category is not None:
            tissue_category_by_term[bucket['key']] = best_category

    if collect_tissue_categories:
        ret_result["meta"]["tissue_category_by_term"] = tissue_category_by_term
        ret_result["meta"]["tissue_category_counts_by_term"] = tissue_category_counts_by_term

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
            # If any part of a composite key is missing, bucket under "No value"
            # so those documents are not dropped from aggregations.
            source_parts = []
            value_parts = []
            for idx, field in enumerate(field_or_field_list):
                value_var = f"v{idx}"
                source_parts.append(f"def {value_var} = doc['embedded.{field}.raw'];")
                source_parts.append(f"if ({value_var} == null || {value_var}.size() == 0) {{ return params.missing; }}")
                value_parts.append(f"{value_var}.value")
            source_parts.append("return " + " + params.sep + ".join(value_parts) + ";")
            return {
                "source": "".join(source_parts),
                "lang": "painless",
                "params": {
                    "missing": TERM_NAME_FOR_NO_VALUE,
                    "sep": value_delimiter
                }
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
    # Column totals aggregation (use full column_agg_fields_orig for composite keys)
    primary_agg["column_totals"] = {
        "terms": {
            get_es_key(column_agg_fields_orig): get_es_value(column_agg_fields_orig),
            "missing": TERM_NAME_FOR_NO_VALUE,
            "size": MAX_BUCKET_COUNT
        },
        "aggs": deepcopy(base_aggregation_def)
    }
    # Nest row totals aggregation
    if len(row_agg_fields) > row_totals_es_agg_start_index + 1:
        build_nested_aggs(primary_agg, row_agg_fields[row_totals_es_agg_start_index + 1:], deepcopy(extra_total_aggs), "row_totals_0", "row_totals_")

    search_param_lists['limit'] = search_param_lists['from'] = [0]
    subreq = make_search_subreq(request, '{}?{}'.format('/search/', urlencode(search_param_lists, True)))
    # import pdb; pdb.set_trace()
    search_result = perform_search_request(None, subreq, custom_aggregations=primary_agg)
    facets = search_result.get('facets', [])
    filters = search_result.get('filters', [])

    for field_to_delete in FIELDS_TO_DELETE:
        if search_result.get(field_to_delete) is None:
            continue
        del search_result[field_to_delete]

    def collect_facet_terms(search_facets):
        facet_terms = {}
        for facet in search_facets:
            field = facet.get('field')
            if not field:
                continue
            terms = facet.get('terms', [])
            facet_terms[field] = [term.get('key') for term in terms if term.get('key') is not None]
        return facet_terms

    facet_terms = collect_facet_terms(facets)

    ret_result = {  # We will fill up the "terms" here from our search_result buckets and then return this dictionary.
        "field": column_agg_fields[0] if isinstance(column_agg_fields, list) else column_agg_fields,
        "terms": {},
        "counts": {
            "files": search_result['total']
        },
        "row_total_field": row_agg_fields[row_totals_es_agg_start_index],
        "row_total_terms": {},
        "facet_terms": facet_terms,
        "facets": facets,
        "filters": filters,
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

    # Derive the extra-total result field names once, rather than re-scanning
    # EXTRA_TOTAL_AGGREGATIONS (and re-checking each entry) for every bucket.
    extra_result_fields = [
        extra_agg['result_field']
        for extra_agg in EXTRA_TOTAL_AGGREGATIONS
        if extra_agg.get('result_field')
    ]

    def extract_bucket_counts(bucket_result):
        total_coverage = bucket_result.get('total_coverage')
        counts = {
            'files': int(bucket_result['doc_count']),
            'total_coverage': total_coverage['value'] if total_coverage else 0
        }
        for result_field in extra_result_fields:
            extra_total = bucket_result.get(result_field)
            if extra_total and 'value' in extra_total:
                counts[result_field] = int(extra_total['value'])
        return counts

    def format_bucket_result(bucket_result, returned_buckets, curr_field_depth=0, field_key="field", terms_key="terms", field_prefix="field_", agg_fields=row_agg_fields):
        """
        Formats a nested aggregation result (bucket_result) into a structured
        dictionary (returned_buckets), recursively processing aggregation fields
        and collecting totals for each bucket. Used for hierarchical data
        aggregation, such as Elasticsearch-style bucket results.
        """

        curr_bucket_counts = extract_bucket_counts(bucket_result)
        key = bucket_result['key']

        if len(agg_fields) > curr_field_depth:  # More fields agg results to add
            next_field_name = agg_fields[curr_field_depth]
            nested = bucket_result[field_prefix + str(curr_field_depth + 1)]
            entry = {
                "term": key,
                field_key: next_field_name[0] if isinstance(next_field_name, list) else next_field_name,
                "counts": curr_bucket_counts,
                terms_key: {},
                "other_doc_count": nested.get('sum_other_doc_count', 0),
            }
            returned_buckets[key] = entry
            nested_terms = entry[terms_key]
            for bucket in nested['buckets']:
                format_bucket_result(bucket, nested_terms, curr_field_depth + 1, field_key, terms_key, field_prefix, agg_fields)

        else:
            # Terminal field aggregation -- return just totals, nothing else.
            returned_buckets[key] = {
                "counts": curr_bucket_counts
            }

    for bucket in search_result['aggregations']['field_0']['buckets']:
        format_bucket_result(bucket, ret_result['terms'], 0)
    for bucket in search_result['aggregations']['row_totals_0']['buckets']:
        format_bucket_result(bucket, ret_result['row_total_terms'], 0, "row_total_field", "row_total_terms", "row_totals_", row_agg_fields[row_totals_es_agg_start_index + 1:])

    column_totals = []
    column_totals_buckets = search_result['aggregations'].get('column_totals', {}).get('buckets')
    if not column_totals_buckets:
        column_totals_buckets = search_result['aggregations']['field_0']['buckets']
    for bucket in column_totals_buckets:
        column_totals.append({
            (column_agg_fields_orig[0] if isinstance(column_agg_fields_orig, list) else column_agg_fields_orig): bucket['key'],
            "counts": extract_bucket_counts(bucket)
        })

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
        
        # Precompute which row fields are composite (list) keys once, rather than
        # re-testing isinstance() for every field of every item.
        composite_row_fields = [field for field in row_agg_fields_orig if isinstance(field, list)]
        column_is_composite = len(column_agg_fields_orig) > 1

        def make_composite(data_array, skip_column_agg=False):
            """
            Aggregates specified fields in each item of data_array by joining their
            values with a delimiter, optionally skipping column-based aggregation if
            skip_column_agg is True. Modifies data_array in place.
            """
            if column_is_composite and not skip_column_agg:
                for item in data_array:
                    if all(field in item for field in column_agg_fields_orig):
                        item[column_agg_fields_orig[0]] = value_delimiter.join(
                            item[field] for field in column_agg_fields_orig
                        )
            if composite_row_fields:
                for item in data_array:
                    for agg_field in composite_row_fields:
                        if all(field in item for field in agg_field):
                            item[agg_field[0]] = value_delimiter.join(
                                item[field] for field in agg_field
                            )
        
        make_composite(data)
        make_composite(row_totals, True)

        ret_result = {
            "column_agg_fields": column_agg_fields_orig,
            "row_agg_fields": row_agg_fields_orig,
            "data": data,
            "row_totals": row_totals,
            "column_totals": column_totals,
            "counts": ret_result["counts"],
            "facet_terms": ret_result["facet_terms"],
            "facets": ret_result["facets"],
            "filters": ret_result["filters"],
            "time_generated": ret_result["time_generated"],
            "flatten_values": True,
            "value_delimiter": value_delimiter,
            "search_params": search_param_lists
        }    

    else:
        ret_result["column_totals"] = column_totals

    return ret_result
