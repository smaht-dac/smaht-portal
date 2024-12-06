import pyramid
from typing import List, Optional
from urllib.parse import urlencode
from encoded.elasticsearch_utils import create_elasticsearch_aggregation_query
from encoded.elasticsearch_utils import merge_elasticsearch_aggregation_results
from encoded.elasticsearch_utils import normalize_elasticsearch_aggregation_results
from encoded.endpoint_utils import parse_date_range_related_arguments
from encoded.endpoint_utils import request_arg, request_args, request_arg_bool, request_arg_int
from snovault.search.search import search as snovault_search
from snovault.search.search_utils import make_search_subreq as snovault_make_search_subreq

QUERY_FILE_TYPES = ["OutputFile"]
QUERY_FILE_STATUSES = ["released"]
QUERY_FILE_CATEGORIES = ["!Quality Control"]
QUERY_RECENT_MONTHS = 3
QUERY_INCLUDE_CURRENT_MONTH = True

AGGREGATION_FIELD_RELEASE_DATE = "file_status_tracking.released"
AGGREGATION_FIELD_CELL_LINE = "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"
AGGREGATION_FIELD_DONOR = "donors.display_title"
AGGREGATION_FIELD_FILE_DESCRIPTOR = "release_tracker_description"

AGGREGATION_MAX_BUCKETS = 100
AGGREGATION_NO_VALUE = "No value"


def recent_files_summary(request: pyramid.request.Request) -> dict:
    """
    This supports the (new as of 2024-12)  /recent_files_summary endpoint (for C4-1192) to return,
    by default, info for files released withing the past three months grouped by release-date,
    cell-line or donor, and file-description. The specific fields used for these groupings are:

    - release-date: file_status_tracking.released
    - cell-line: file_sets.libraries.analytes.samples.sample_sources.cell_line.code
    - donor: donors.display_title
    - file-dsecription: release_tracker_description

    Note that release_tracker_description is a newer (2024-12)
    calculated property - see PR-298 (branch: sn_file_release_tracker).

    By default the current (assuminging partial) month IS included, so we really return info for
    the past FULL three months plus for whatever time has currently elapsed for the current month. 
    Use pass the include_current_month=false query argument to NOT include the current month.

    The number of months of data can be controlled using the nmonths query argument, e.g. nmonths=6.

    A specific date range can also be passed in e.g. using from_date=2024-08-01 and thru_date=2024-10-31.

    For testing purposes, a date field other than the default file_status_tracking.released can
    also be specified using the date_property_name query argument. And file statuses other than
    released can be queried for using one or more status query arguments, e.g. status=uploaded. 
    """

    date_property_name = request_arg(request, "date_property_name", AGGREGATION_FIELD_RELEASE_DATE)
    max_buckets = request_arg_bool(request, "max_buckets", AGGREGATION_MAX_BUCKETS)
    nosort = request_arg_bool(request, "nosort")
    debug = request_arg_bool(request, "debug")
    debug_query = request_arg_bool(request, "debug_query")
    raw = request_arg_bool(request, "raw")

    def create_query(request: pyramid.request.Request) -> str:

        global QUERY_FILE_CATEGORIES, QUERY_FILE_STATUSES, QUERY_FILE_TYPES
        nonlocal date_property_name

        types = request_args(request, "type", QUERY_FILE_TYPES)
        statuses = request_args(request, "status", QUERY_FILE_STATUSES)
        categories = request_args(request, "category", QUERY_FILE_CATEGORIES)
        recent_months = request_arg_int(request, "nmonths", request_arg_int(request, "months", QUERY_RECENT_MONTHS))
        from_date = request_arg(request, "from_date")
        thru_date = request_arg(request, "thru_date")
        include_current_month = request_arg_bool(request, "include_current_month", QUERY_INCLUDE_CURRENT_MONTH)

        from_date, thru_date = parse_date_range_related_arguments(from_date, thru_date, nmonths=recent_months,
                                                                  include_current_month=include_current_month,
                                                                  strings=True)
        query_parameters = {
            "type": types if types else None,
            "status": statuses if statuses else None,
            "data_category": categories if categories else None,
            f"{date_property_name}.from": from_date if from_date else None,
            f"{date_property_name}.to": thru_date if from_date else None,
            "from": 0,
            "limit": 0
        }
        query_parameters = {key: value for key, value in query_parameters.items() if value is not None}
        query_string = urlencode(query_parameters, True)
        # Hackishness to change "=!" to "!=" in search_param_lists value for e.g. to turn this in the
        # query_parameters above "data_category": ["!Quality Control"] into: data_category&21=Quality+Control
        query_string = query_string.replace("=%21", "%21=")
        return f"/search/?{query_string}"

    def create_aggregations_query(aggregation_fields: List[str]) -> dict:
        global AGGREGATION_NO_VALUE
        nonlocal date_property_name, max_buckets
        aggregations = []
        if not isinstance(aggregation_fields, list):
            aggregation_fields = [aggregation_fields]
        for item in aggregation_fields:
            if isinstance(item, str) and (item := item.strip()) and (item not in aggregations):
                aggregations.append(item)
        if not aggregations:
            return {}
        def create_field_aggregation(field: str) -> Optional[dict]:  # noqa
            nonlocal date_property_name
            if field == date_property_name:
                return {
                    "date_histogram": {
                        "field": f"embedded.{field}",
                        "calendar_interval": "month",
                        "format": "yyyy-MM",
                        "missing": "1970-01",
                        "order": {"_key": "desc"}
                    }
                }
        aggregation_query = create_elasticsearch_aggregation_query(
            aggregations,
            max_buckets=max_buckets,
            missing_value=AGGREGATION_NO_VALUE,
            create_field_aggregation=create_field_aggregation)
        return aggregation_query[date_property_name]

    def execute_query(request: pyramid.request.Request, query: str, aggregations_query: dict) -> str:
        request = snovault_make_search_subreq(request, path=query, method="GET")
        results = snovault_search(None, request, custom_aggregations=aggregations_query)
        return results

    query = create_query(request)

    aggregations_by_cell_line = [
        date_property_name,
        AGGREGATION_FIELD_CELL_LINE,
        AGGREGATION_FIELD_FILE_DESCRIPTOR
    ]

    aggregations_by_donor = [
        date_property_name,
        AGGREGATION_FIELD_DONOR,
        AGGREGATION_FIELD_FILE_DESCRIPTOR
    ]

    aggregations_query = {
        "group_by_cell_line": create_aggregations_query(aggregations_by_cell_line),
        "group_by_donor": create_aggregations_query(aggregations_by_donor)
    }

    if debug_query:
        return {"query": query, "aggregations_query": aggregations_query}

    raw_results = execute_query(request, query, aggregations_query)

    # Note that the doc_count values returned by ElasticSearch do actually seem to be for unique items,
    # i.e. if an item appears in two different groups (e.g. if, say, f2584000-f810-44b6-8eb7-855298c58eb3
    # has file_sets.libraries.analytes.samples.sample_sources.cell_line.code values for both HG00438 and HG005),
    # then it its doc_count will not count it twice. This creates a situation where it might look like the counts
    # are wrong in this returned merged/normalized result set where the outer item count is less than the sum of
    # the individual counts withni each sub-group. For example, the below result shows a top-level doc_count of 1
    # even though there are 2 documents, 1 in the HG00438 group and the other in the HG005 it would be because
    # the same unique file has a cell_line.code of both HG00438 and HG005.
    # {
    #     "meta": { "field_name": "file_status_tracking.released" },
    #     "buckets": [
    #         {
    #             "key_as_string": "2024-12", "key": 1733011200000, "doc_count": 1,
    #             "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
    #                 "meta": { "field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code" },
    #                 "buckets": [
    #                     {   "key": "HG00438", "doc_count": 1,
    #                         "release_tracker_description": {
    #                             "meta": { "field_name": "release_tracker_description" },
    #                             "buckets": [
    #                                 { "key": "WGS Illumina NovaSeq X bam", "doc_count": 1 },
    #                             ]
    #                         }
    #                     },
    #                     {   "key": "HG005", "doc_count": 1,
    #                         "release_tracker_description": {
    #                             "meta": { "field_name": "release_tracker_description" },
    #                             "buckets": [
    #                                 { "key": "Fiber-seq PacBio Revio bam", "doc_count": 1 }
    #                             ]
    #                         }
    #                     }
    #                 ]
    #             }
    #         }
    #     ]
    # }

    if raw:
        # For debugging/troubleshooting only if raw=true then return raw ElasticSearch results.
        if debug:
            raw_results = {"query": query, "aggregations_query": aggregations_query, "raw_results": raw_results}
        elif "@id" in raw_results:
            # Unless we do this we get redirect to the URL in this field, for example
            # to: /search/?type=OutputFile&status=released&data_category%21=Quality+Control
            #         &file_status_tracking.released.from=2024-09-30
            #         &file_status_tracking.released.to=2024-12-31&from=0&limit=0'
            del raw_results["@id"]
        return raw_results

    if not (raw_results := raw_results.get("aggregations")):
        return {}

    raw_results_by_cell_line = raw_results.get("group_by_cell_line")
    raw_results_by_donor = raw_results.get("group_by_donor")
    merged_results = merge_elasticsearch_aggregation_results(raw_results_by_cell_line, raw_results_by_donor)
    additional_properties = {"query": query, "aggregations_query": aggregations_query} if debug else None
    return normalize_elasticsearch_aggregation_results(merged_results, sort=not nosort,
                                                       additional_properties=additional_properties)
