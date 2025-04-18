from copy import deepcopy
from pyramid.request import Request as PyramidRequest, Response as PyramidResponse
from typing import Callable, List, Optional
from dcicutils.misc_utils import normalize_spaces
from encoded.endpoints.elasticsearch_utils import (
        add_additional_field_to_retrieve_to_elasticsearch_aggregation_query,
        add_debugging_to_elasticsearch_aggregation_query,
        create_elasticsearch_aggregation_query,
        merge_elasticsearch_aggregation_results,
        normalize_elasticsearch_aggregation_results,
        prune_elasticsearch_aggregation_results,
        sort_normalized_aggregation_results,
        AGGREGATION_MAX_BUCKETS, AGGREGATION_NO_VALUE)
from encoded.endpoints.endpoint_utils import (
        request_arg, request_args, request_arg_bool, request_arg_int,
        create_query_string, deconstruct_query_string,
        get_date_range_for_month, parse_date_range_related_arguments)
from encoded.endpoints.recent_files_summary.recent_files_summary_fields import (
        AGGREGATION_FIELD_RELEASE_DATE,
        AGGREGATION_FIELD_GROUPING_CELL_OR_DONOR,
        AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE,
        AGGREGATION_FIELD_CELL_MIXTURE,
        AGGREGATION_FIELD_DONOR,
        AGGREGATION_FIELD_DSA_DONOR,
        AGGREGATION_FIELD_CELL_LINE,
        AGGREGATION_FIELD_FILE_DESCRIPTOR)
from encoded.endpoints.recent_files_summary.recent_files_summary_troubleshooting import (
        add_info_for_troubleshooting,
        get_normalized_aggregation_results_as_html_for_troublehshooting)
from snovault.search.search import search as snovault_search
from snovault.search.search_utils import make_search_subreq as snovault_make_search_subreq

# N.B. This implementation has undergone a number of iterations/changes. Currently (2025-02-24) it is much simpler
# than it originally was due to the introduction of the (calculated) property "release_tracker_title"; previous to
# that we used special code ("painless") in the ElasticSearch aggregation query to choose from among three possible
# properties (AGGREGATION_FIELD_CELL_MIXTURE, AGGREGATION_FIELD_DONOR, AGGREGATION_FIELD_DSA_DONOR); but now the
# query is much mroe straightforward. So some this code can/should eventually be elided; though for the time being
# it is still here and even accessible using the "legacy=true" URL query argument to the API.

QUERY_FILE_TYPES = ["OutputFile", "SubmittedFile"]
QUERY_FILE_STATUSES = ["released"]
QUERY_FILE_CATEGORIES = ["!Quality Control"]
QUERY_RECENT_MONTHS = 3
QUERY_INCLUDE_CURRENT_MONTH = True
BASE_SEARCH_QUERY = "/search/"
LEGACY_DEFAULT = False


def recent_files_summary_endpoint(context, request):
    # This text=true support is purely for troublesooting purposes; it dumps
    # terminal-like formatted output for the results returned by the query.
    text = request_arg_bool(request, "text")
    results = recent_files_summary(request, troubleshooting=text)
    if text:
        text_uuids = request_arg_bool(request, "text_uuids", True)
        text_uuid_details = request_arg_bool(request, "text_uuid_details", True)
        text_query = request_arg_bool(request, "text_query")
        text_verbose = request_arg_bool(request, "text_verbose")
        text_debug = request_arg_bool(request, "text_debug")
        legacy = request_arg_bool(request, "legacy", LEGACY_DEFAULT)
        results = get_normalized_aggregation_results_as_html_for_troublehshooting(results,
                                                                                  uuids=text_uuids,
                                                                                  uuid_details=text_uuid_details,
                                                                                  query=text_query,
                                                                                  verbose=text_verbose,
                                                                                  debug=text_debug,
                                                                                  legacy=legacy)
        results = PyramidResponse(f"<pre>{results}</pre>", content_type='text/html')
    return results


def recent_files_summary(request: PyramidRequest,
                         troubleshooting: bool = False,
                         custom_execute_aggregation_query: Optional[Callable] = None) -> dict:
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
    include_missing = request_arg_bool(request, "include_missing", request_arg_bool(request, "novalues"))
    exclude_tissue_info = request_arg_bool(request, "exclude_tissue_info")
    exclude_submitted_file = request_arg_bool(request, "exclude_submitted_file")
    tissue_info_property_name = request_arg(request, "tissue_info_property_name", "sample_summary.tissues")
    multi = request_arg_bool(request, "multi")
    nosort = request_arg_bool(request, "nosort")
    debug = request_arg_bool(request, "debug")
    debug_query = request_arg_bool(request, "debug_query")
    troubleshoot = request_arg_bool(request, "troubleshoot")
    troubleshoot_elasticsearch = request_arg_bool(request, "troubleshoot_elasticsearch")
    raw = request_arg_bool(request, "raw")
    legacy = request_arg_bool(request, "legacy", LEGACY_DEFAULT)

    if troubleshooting is True:
        debug = True
        troubleshoot = True
        troubleshoot_elasticsearch = True

    def get_aggregation_field_grouping_cell_or_donor() -> List[str]:
        # This specializes the aggregation query to group first by the cell-line field,
        # and then alternatively (if a cell-line field does not exist) by the donor field.
        # For troubleshooting/testing/or-maybe-if-we-change-our-minds we can alternatively
        # look first for the donor field and then secondarily for the cell-line field.
        nonlocal legacy
        aggregation_field_grouping_cell_or_donor = deepcopy(AGGREGATION_FIELD_GROUPING_CELL_OR_DONOR)
        if not legacy:
            # 2025-02-21: This is now the default (using release_tracker_title).
            aggregation_field_grouping_cell_or_donor = [AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE]
        return aggregation_field_grouping_cell_or_donor

    def create_base_query_arguments(request: PyramidRequest) -> dict:

        global QUERY_FILE_CATEGORIES, QUERY_FILE_STATUSES, QUERY_FILE_TYPES
        nonlocal exclude_submitted_file

        types = request_args(request, "type", QUERY_FILE_TYPES)
        statuses = request_args(request, "status", QUERY_FILE_STATUSES)
        categories = request_args(request, "category", QUERY_FILE_CATEGORIES)

        if exclude_submitted_file and ("SubmittedFile" in types):
            types.remove("SubmittedFile")

        base_query_arguments = {
            "type": types if types else None,
            "status": statuses if statuses else None,
            "data_category": categories if categories else None
        }

        return {key: value for key, value in base_query_arguments.items() if value is not None}

    def create_query_arguments(request: PyramidRequest, base_query_arguments: Optional[dict] = None) -> str:

        global BASE_SEARCH_QUERY, QUERY_RECENT_MONTHS, QUERY_INCLUDE_CURRENT_MONTH
        nonlocal date_property_name

        recent_months = request_arg_int(request, "nmonths", request_arg_int(request, "months", QUERY_RECENT_MONTHS))
        from_date = request_arg(request, "from_date")
        thru_date = request_arg(request, "thru_date")
        include_current_month = request_arg_bool(request, "include_current_month", QUERY_INCLUDE_CURRENT_MONTH)

        from_date, thru_date = parse_date_range_related_arguments(from_date, thru_date, nmonths=recent_months,
                                                                  include_current_month=include_current_month,
                                                                  strings=True)
        query_arguments = {
            f"{date_property_name}.from": from_date if from_date else None,
            f"{date_property_name}.to": thru_date if from_date else None
        }

        if isinstance(base_query_arguments, dict):
            query_arguments = {**base_query_arguments, **query_arguments}
        return query_arguments

    def create_query(request: PyramidRequest, base_query_arguments: Optional[dict] = None) -> str:
        nonlocal legacy
        query_arguments = create_query_arguments(request, base_query_arguments)
        if not legacy:
            if AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE not in query_arguments:
                query_arguments[AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE] = f"!{AGGREGATION_NO_VALUE}"
            if AGGREGATION_FIELD_FILE_DESCRIPTOR not in query_arguments:
                query_arguments[AGGREGATION_FIELD_FILE_DESCRIPTOR] = f"!{AGGREGATION_NO_VALUE}"
        query_string = create_query_string(query_arguments)
        return f"{BASE_SEARCH_QUERY}?{query_string}"

    def create_aggregation_query(aggregation_fields: List[str]) -> dict:

        nonlocal date_property_name, max_buckets, include_missing, troubleshoot_elasticsearch, exclude_tissue_info

        aggregations = []
        if not isinstance(aggregation_fields, list):
            aggregation_fields = [aggregation_fields]
        for item in aggregation_fields:
            if isinstance(item, str) and (item := item.strip()) and (item not in aggregations):
                aggregations.append(item)
        if not aggregations:
            return {}

        def create_field_aggregation(field: str) -> Optional[dict]:  # noqa
            nonlocal aggregation_field_grouping_cell_or_donor, date_property_name, legacy, multi
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
            elif legacy and (field == AGGREGATION_FIELD_CELL_MIXTURE):
                # Note how we prefix the result with the aggregation field name;
                # this is so later we can tell which grouping/field was matched;
                # see fixup_names_values_for_normalized_results for this fixup.
                script = ""
                for aggregation_field_grouping_index in range(len(aggregation_field_grouping_cell_or_donor)):
                    aggregation_field = aggregation_field_grouping_cell_or_donor[aggregation_field_grouping_index]
                    if_or_else_if = "if" if aggregation_field_grouping_index == 0 else "else if"
                    # Note that if there are multiple values for the aggregation field just the "first" one will be chosen;
                    # where "first" means which was indexed first, which from an application POV is kind of arbitrary.
                    # If we want to make it more deterministic we could order the results (say) alphabetically like so: 
                    #   def value = doc['embedded.{aggregation_field}.raw'].stream().min((a, b) -> a.compareTo(b)).get();
                    #   return '{aggregation_field}:' + value;
                    # OR, if we actually want to aggregation on ALL values we could collect the results and return all like so:
                    #   def values = [];
                    #   for (value in doc['embedded.{aggregation_field}.raw']) {
                    #       values.add('{aggregation_field}:' + value);
                    #   }
                    #   return values;
                    # But then we'd get double counting and so on. We are told in any case that these groups should be distinct.
                    if not multi:
                        script += f"""
                            {if_or_else_if} (doc['embedded.{aggregation_field}.raw'].size() > 0) {{
                                return '{aggregation_field}:' + doc['embedded.{aggregation_field}.raw'].value;
                            }}
                        """
                    else:
                        script += f"""
                            {if_or_else_if} (doc['embedded.{aggregation_field}.raw'].size() > 0) {{
                                def values = [];
                                for (value in doc['embedded.{aggregation_field}.raw']) {{
                                    values.add('{aggregation_field}:' + value);
                                }}
                                return values;
                            }}
                        """
                script += f"""
                    else {{
                        return 'unknown';
                    }}
                """
                return {
                    "terms": {
                        "script": {
                            "source": normalize_spaces(script),
                            "lang": "painless"
                        },
                        "size": max_buckets
                    }
                }

        def create_field_filter(field: str) -> Optional[dict]:  # noqa
            nonlocal aggregation_field_grouping_cell_or_donor
            if field == AGGREGATION_FIELD_CELL_MIXTURE:
                filter = {"bool": {"should": [], "minimum_should_match": 1}}
                for aggregation_field in aggregation_field_grouping_cell_or_donor:
                    filter["bool"]["should"].append({"exists": { "field": f"embedded.{aggregation_field}.raw"}})
                return filter

        aggregation_query = create_elasticsearch_aggregation_query(
            aggregations,
            max_buckets=max_buckets,
            missing_value=AGGREGATION_NO_VALUE,
            include_missing=include_missing,
            create_field_aggregation=create_field_aggregation,
            create_field_filter=create_field_filter)

        if troubleshoot_elasticsearch:
            add_debugging_to_elasticsearch_aggregation_query(aggregation_query[date_property_name])
        if not exclude_tissue_info:
            add_additional_field_to_retrieve_to_elasticsearch_aggregation_query(aggregation_query[date_property_name],
                                                                                tissue_info_property_name)

        return aggregation_query[date_property_name]

    def execute_aggregation_query(request: PyramidRequest, query: str, aggregation_query: dict) -> str:
        nonlocal custom_execute_aggregation_query
        if callable(custom_execute_aggregation_query):
            # For testing/mocking ONLY.
            return custom_execute_aggregation_query(request, query, aggregation_query)
        query += "&from=0&limit=0"  # needed for aggregation query to not return the actual/individual item results.

        request.remote_user = "IMPORT"  # This allows anonymous (unauthorized) queries.
        request = snovault_make_search_subreq(request, path=query, method="GET")
        results = snovault_search(None, request, custom_aggregations=aggregation_query)
        return results

    def fixup_names_values_for_normalized_results(normalized_results: dict) -> None:
        nonlocal aggregation_field_grouping_cell_or_donor
        if isinstance(normalized_results, dict):
            if isinstance(value := normalized_results.get("value"), str):
                if ((separator_index := value.find(":")) > 0) and (value_prefix := value[0:separator_index]):
                    if value_prefix in aggregation_field_grouping_cell_or_donor:
                        if value := value[separator_index + 1:]:
                            normalized_results["name"] = value_prefix
                            normalized_results["value"] = value
            if isinstance(items := normalized_results.get("items"), list):
                for element in items:
                    fixup_names_values_for_normalized_results(element)

    def hoist_items_additional_value_up_one_level(data: dict,
                                                  items_property_name: Optional[str] = None,
                                                  additional_value_property_name: Optional[str] = None) -> None:
        """
        The way the additional tissue info works (i.e. sample_summary.tissues) it is included in the ElasticSearch
        results at the inner-most (hit) level. The normalize_elasticsearch_aggregation_results function puts these
        in the additional_value property there, but we don't want these values at that inner-most level, i.e. at the
        level of release_tracker_description, but rather one level up at the donor level (i.e. donors.display_title).
        So this hoists these up to that level, but only if their values are all the same, which in practice they are.
        """
        if not isinstance(items_property_name, str):
            items_property_name = "items"
        if isinstance(data, dict) and isinstance(items := data.get(items_property_name), list):
            if not isinstance(additional_value_property_name, str):
                additional_value_property_name = "additional_value"
            for item in items:
                if isinstance(item.get(items_property_name), list):
                    hoist_items_additional_value_up_one_level(item, items_property_name=items_property_name,
                                                              additional_value_property_name=additional_value_property_name)
            common_additional_value = None
            for item in items:
                if (additional_value := item.get(additional_value_property_name)) is None:
                    break
                if common_additional_value is None:
                    common_additional_value = additional_value
                elif common_additional_value != additional_value:
                    common_additional_value = None
                    break
            if common_additional_value is not None:
                data[additional_value_property_name] = common_additional_value
                for item in items:
                    if additional_value_property_name in item:
                        del item[additional_value_property_name]

    def add_queries_to_normalized_results(normalized_results: dict, base_query_arguments: dict) -> None:
        global BASE_SEARCH_QUERY
        nonlocal date_property_name, legacy
        if isinstance(normalized_results, dict):
            if name := normalized_results.get("name"):
                if value := normalized_results.get("value"):
                    if name == date_property_name:
                        # Special case for date value which is just year/month (e.g. 2024-12);
                        # we want to turn this into a date range query for the month; actually
                        # this is not a special case, this is the NORMAL case we are dealing with.
                        # from_date, thru_date = parse_date_range_related_arguments(value, None, nmonths=0, strings=True)
                        from_date, thru_date = get_date_range_for_month(value, strings=True)
                        if from_date and thru_date:
                            base_query_arguments = {**base_query_arguments,
                                                    f"{name}.from": from_date, f"{name}.to": thru_date}
                    else:
                        base_query_arguments = {**base_query_arguments, name: value}
                query_arguments = deepcopy(base_query_arguments)
                if not legacy:
                    if AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE not in query_arguments:
                        query_arguments[AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE] = f"!{AGGREGATION_NO_VALUE}"
                    if AGGREGATION_FIELD_FILE_DESCRIPTOR not in query_arguments:
                        query_arguments[AGGREGATION_FIELD_FILE_DESCRIPTOR] = f"!{AGGREGATION_NO_VALUE}"
                normalized_results["query"] = create_query_string(query_arguments, BASE_SEARCH_QUERY)
            if isinstance(items := normalized_results.get("items"), list):
                for element in items:
                    add_queries_to_normalized_results(element, base_query_arguments)

    aggregation_field_grouping_cell_or_donor = get_aggregation_field_grouping_cell_or_donor()
    # The base_query_arguments does not contain the from/thru dates as this is used;
    # this is used to construct the query-string for the individually grouped items which
    # will have the from/thru dates specifically representing their place within the group.
    base_query_arguments = create_base_query_arguments(request)
    query = create_query(request, base_query_arguments)

    aggregate_by_cell_line_property_name = "aggregate_by_cell_line"
    aggregate_by_cell_line = [
        date_property_name,
        AGGREGATION_FIELD_CELL_MIXTURE if legacy else AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE,
        AGGREGATION_FIELD_FILE_DESCRIPTOR
    ]
    aggregation_query = {
        aggregate_by_cell_line_property_name: create_aggregation_query(aggregate_by_cell_line)
    }

    if debug_query:
        return {
            "query": query,
            "query_arguments": deconstruct_query_string(query),
            "aggregation_query_fields": [
                AGGREGATION_FIELD_RELEASE_DATE,
                *aggregation_field_grouping_cell_or_donor,
                AGGREGATION_FIELD_FILE_DESCRIPTOR
            ],
            "aggregation_query": aggregation_query
        }

    raw_results = execute_aggregation_query(request, query, aggregation_query)

    if raw:
        # For debugging/troubleshooting only if raw=true then return raw ElasticSearch results.
        # And note that unless we remove the @id property we get redirected to the URL in this field,
        # for example to: /search/?type=OutputFile&status=released&data_category%21=Quality+Control
        #                         &file_status_tracking.released.from=2024-09-30
        #                         &file_status_tracking.released.to=2024-12-31&from=0&limit=0'
        if "@id" in raw_results:
            del raw_results["@id"]
        return raw_results

    if not (raw_results := raw_results.get("aggregations")):
        return {}

    prune_elasticsearch_aggregation_results(raw_results)

    aggregation_results = raw_results.get(aggregate_by_cell_line_property_name)

    if debug:
        additional_properties = {
            "debug": {
                "query": query,
                "query_arguments": deconstruct_query_string(query),
                "aggregation_query_fields": [
                    AGGREGATION_FIELD_RELEASE_DATE,
                    *aggregation_field_grouping_cell_or_donor,
                    AGGREGATION_FIELD_FILE_DESCRIPTOR
                ],
                "aggregation_query": aggregation_query,
                "raw_results": deepcopy(raw_results),  # copy otherwise may be overwritten by below
                "aggregation_results": deepcopy(aggregation_results)
            }
        }
    else:
        additional_properties = None

    # Note that the doc_count values returned by ElasticSearch DO actually seem to be for UNIQUE items,
    # i.e. if an item appears in two different groups (e.g. if, say, f2584000-f810-44b6-8eb7-855298c58eb3
    # has file_sets.libraries.analytes.samples.sample_sources.cell_line.code values for both HG00438 and HG005),
    # then its doc_count will NOT be counted TWICE. This creates a situation where it might LOOK like the counts
    # are WRONG in the MERGED (via returned merge_elasticsearch_aggregation_results) result set, where the outer
    # item count may be than the sum of the individual counts within each sub-group. For example, the below result
    # shows a top-level doc_count of 1, even though there are 2 documents, 1 in the HG00438 group and the other
    # in the HG005 it would be because the same unique file has a cell_line.code of both HG00438 and HG005.
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

    normalized_results = normalize_elasticsearch_aggregation_results(
        aggregation_results,
        additional_field=tissue_info_property_name if not exclude_tissue_info else None,
        additional_properties=additional_properties,
        remove_empty_items=not include_missing)

    if not exclude_tissue_info:
        if False:
            # 2025-02-24: No longer hoist this (sample_summary.tissues) property up one level;
            # actually forget why this was originally done this way; but in any case no longer desired.
            hoist_items_additional_value_up_one_level(normalized_results)

    fixup_names_values_for_normalized_results(normalized_results)
    add_queries_to_normalized_results(normalized_results, base_query_arguments)
    normalized_results["query"] = query

    if not nosort:
        # We can sort on the aggregations by level; outermost/left to innermost/right.
        # In our case the outermost is the date aggregation so sort taht by the key value,
        # e.g. 2014-12, descending; and the rest of the inner levels by the default
        # sorting which is by aggregation count descending and secondarily by the key value.
        sort_normalized_aggregation_results(normalized_results, ["-key", "default"])

    if troubleshoot:
        add_info_for_troubleshooting(normalized_results, request)

    return normalized_results
