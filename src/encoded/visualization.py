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


def includeme(config):
    config.add_route('trace_meta_workflow_runs', '/trace_meta_workflow_run_steps/{file_uuid}/', traverse='/{file_uuid}')
    config.add_route('date_histogram_aggregations', '/date_histogram_aggregations/')
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
            # get empty buckets for missing dates (works for intervals, currently not spanning all time-frame)
            # if (date_from is not None or date_to is not None):
            #     date_histogram['min_doc_count'] = 0
            #     date_histogram['extended_bounds'] = {
            #         "min": date_from.strftime("%Y-%m-%d") if date_from is not None else None,
            #         "max": date_to.strftime("%Y-%m-%d") if date_to is not None else None
            #     }
            outer_date_histogram_agg[interval + '_interval_' + dh_field] = {
                "date_histogram": date_histogram
            }
            if histogram_sub_aggs:
                outer_date_histogram_agg[interval + '_interval_' + dh_field]['aggs'] = histogram_sub_aggs

    search_param_lists['limit'] = search_param_lists['from'] = [0]
    subreq = make_search_subreq(request, '{}?{}'.format('/search/', urlencode(search_param_lists, True)))
    search_result = perform_search_request(None, subreq, custom_aggregations=outer_date_histogram_agg)

    # remove unnecessary fields from result
    for field_to_delete in ['@context', '@id', '@type', '@graph', 'title', 'filters', 'facets', 'sort', 'clear_filters', 'actions', 'columns']:
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


def last_day_of_month(any_day):
    next_month = any_day.replace(day=28) + timedelta(days=4)
    return next_month - timedelta(days=next_month.day)


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
