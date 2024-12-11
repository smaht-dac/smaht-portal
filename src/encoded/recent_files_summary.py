import pyramid
from copy import deepcopy
from typing import List, Optional
from dcicutils.misc_utils import normalize_spaces
from encoded.elasticsearch_utils import add_debugging_to_elasticsearch_aggregation_query
from encoded.elasticsearch_utils import create_elasticsearch_aggregation_query
from encoded.elasticsearch_utils import merge_elasticsearch_aggregation_results
from encoded.elasticsearch_utils import normalize_elasticsearch_aggregation_results
from encoded.elasticsearch_utils import prune_elasticsearch_aggregation_results
from encoded.elasticsearch_utils import sort_normalized_aggregation_results
from encoded.elasticsearch_utils import AGGREGATION_MAX_BUCKETS, AGGREGATION_NO_VALUE
from encoded.endpoint_utils import create_query_string, parse_date_range_related_arguments
from encoded.endpoint_utils import request_arg, request_args, request_arg_bool, request_arg_int
from snovault.search.search import search as snovault_search
from snovault.search.search_utils import make_search_subreq as snovault_make_search_subreq

QUERY_FILE_TYPES = ["OutputFile"]
QUERY_FILE_STATUSES = ["released"]
QUERY_FILE_CATEGORIES = ["!Quality Control"]
QUERY_RECENT_MONTHS = 3
QUERY_INCLUDE_CURRENT_MONTH = True

AGGREGATION_FIELD_RELEASE_DATE = "file_status_tracking.released"
AGGREGATION_FIELD_CELL_MIXTURE = "file_sets.libraries.analytes.samples.sample_sources.code"
AGGREGATION_FIELD_CELL_LINE = "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"
AGGREGATION_FIELD_DONOR = "donors.display_title"
AGGREGATION_FIELD_FILE_DESCRIPTOR = "release_tracker_description"

AGGREGATION_FIELD_GROUPING_CELL_OR_DONOR = [
    AGGREGATION_FIELD_CELL_MIXTURE,
    AGGREGATION_FIELD_CELL_LINE,
    AGGREGATION_FIELD_DONOR
]

BASE_SEARCH_QUERY = "/search/"

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

    global AGGREGATION_FIELD_RELEASE_DATE

    date_property_name = request_arg(request, "date_property_name", AGGREGATION_FIELD_RELEASE_DATE)
    max_buckets = request_arg_bool(request, "max_buckets", AGGREGATION_MAX_BUCKETS)
    include_queries = request_arg_bool(request, "include_queries", request_arg_bool(request, "include_query", True))
    include_missing = request_arg_bool(request, "include_missing", request_arg_bool(request, "novalues"))
    nocells = request_arg_bool(request, "nocells", request_arg_bool(request, "nocell"))
    nomixtures = request_arg_bool(request, "nomixtures", request_arg_bool(request, "nomixture"))
    favor_donor = request_arg_bool(request, "favor_donor")
    nosort = request_arg_bool(request, "nosort")
    legacy = request_arg_bool(request, "legacy")
    debug = request_arg_bool(request, "debug")
    debug_query = request_arg_bool(request, "debug_query")
    troubleshoot = request_arg_bool(request, "troubleshoot")
    troubleshoot_elasticsearch = request_arg_bool(request, "troubleshoot_elasticsearch")
    raw = request_arg_bool(request, "raw")
    willrfix = request_arg_bool(request, "willrfix")

    def get_aggregation_field_grouping_cell_or_donor():
        # This specializes the aggregation query to group first by the cell-line field,
        # and then alternatively (if a cell-line field does not exist) by the donor field.
        # For troubleshooting/testing/or-maybe-if-we-change-our-minds we can alternatively
        # look first for the donor field and then secondarily for the cell-line field. 
        global AGGREGATION_FIELD_GROUPING_CELL_OR_DONOR
        nonlocal nocells, nomixtures, favor_donor
        aggregation_field_grouping_cell_or_donor = deepcopy(AGGREGATION_FIELD_GROUPING_CELL_OR_DONOR)
        if nocells:
            aggregation_field_grouping_cell_or_donor.remove(AGGREGATION_FIELD_CELL_LINE)
        if nomixtures:
            aggregation_field_grouping_cell_or_donor.remove(AGGREGATION_FIELD_CELL_MIXTURE)
        if favor_donor:
            aggregation_field_grouping_cell_or_donor.remove(AGGREGATION_FIELD_DONOR)
            aggregation_field_grouping_cell_or_donor.insert(0, AGGREGATION_FIELD_DONOR)
        return aggregation_field_grouping_cell_or_donor

    def create_base_query_arguments(request: pyramid.request.Request) -> dict:

        global QUERY_FILE_CATEGORIES, QUERY_FILE_STATUSES, QUERY_FILE_TYPES

        types = request_args(request, "type", QUERY_FILE_TYPES)
        statuses = request_args(request, "status", QUERY_FILE_STATUSES)
        categories = request_args(request, "category", QUERY_FILE_CATEGORIES)

        base_query_arguments = {
            "type": types if types else None,
            "status": statuses if statuses else None,
            "data_category": categories if categories else None
        }

        return {key: value for key, value in base_query_arguments.items() if value is not None}

    def create_query(request: pyramid.request.Request, base_query_arguments: Optional[dict] = None) -> str:

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

        return f"{BASE_SEARCH_QUERY}?{create_query_string(query_arguments)}"

    def create_aggregation_query(aggregation_fields: List[str]) -> dict:

        nonlocal date_property_name, max_buckets, include_missing, favor_donor, troubleshoot_elasticsearch

        aggregations = []
        if not isinstance(aggregation_fields, list):
            aggregation_fields = [aggregation_fields]
        for item in aggregation_fields:
            if isinstance(item, str) and (item := item.strip()) and (item not in aggregations):
                aggregations.append(item)
        if not aggregations:
            return {}

        def create_field_aggregation(field: str) -> Optional[dict]:  # noqa
            nonlocal aggregation_field_grouping_cell_or_donor, date_property_name, nocells, nomixtures
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
            elif field == AGGREGATION_FIELD_CELL_LINE:
                # Note how we prefix the result with the aggregation field name;
                # this is so later we can tell which grouping/field was matched;
                # see fixup_names_values_for_normalized_results for this fixup.
                script = ""
                for aggregation_field_grouping_index in range(len(aggregation_field_grouping_cell_or_donor)):
                    aggregation_field = aggregation_field_grouping_cell_or_donor[aggregation_field_grouping_index]
                    if_or_else_if = "if" if aggregation_field_grouping_index == 0 else "else if"
                    script += f"""
                        {if_or_else_if} (doc['embedded.{aggregation_field}.raw'].size() > 0) {{
                            return '{aggregation_field}:' + doc['embedded.{aggregation_field}.raw'].value;
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
            if field == AGGREGATION_FIELD_CELL_LINE:
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

        return aggregation_query[date_property_name]

    def create_aggregation_query_legacy(aggregation_fields: List[str]) -> dict:

        nonlocal date_property_name, max_buckets, include_missing

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
            include_missing=include_missing,
            create_field_aggregation=create_field_aggregation)

        return aggregation_query[date_property_name]

    def execute_aggregation_query(request: pyramid.request.Request, query: str, aggregation_query: dict) -> str:
        query += "&from=0&limit=0"  # needed for aggregation query to not return the actual/individual item results.
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

    def add_queries_to_normalized_results(normalized_results: dict, base_query_arguments: dict) -> None:
        global BASE_SEARCH_QUERY
        nonlocal date_property_name, willrfix
        if isinstance(normalized_results, dict):
            if name := normalized_results.get("name"):
                if value := normalized_results.get("value"):
                    if name == date_property_name:
                        # Special case for date value which is just year/month (e.g. 2024-12);
                        # we want to turn this into a date range query for the month.
                        from_date, thru_date = parse_date_range_related_arguments(value, None, strings=True)
                        if from_date and thru_date:
                            base_query_arguments = {**base_query_arguments,
                                                    f"{name}.from": from_date, f"{name}.to": thru_date}
                    else:
                        base_query_arguments = {**base_query_arguments, name: value}
                if willrfix:
                    if name == AGGREGATION_FIELD_CELL_LINE:
                        base_query_arguments[AGGREGATION_FIELD_CELL_MIXTURE] = AGGREGATION_NO_VALUE
                    elif name == AGGREGATION_FIELD_DONOR:
                        base_query_arguments[AGGREGATION_FIELD_CELL_MIXTURE] = AGGREGATION_NO_VALUE
                        base_query_arguments[AGGREGATION_FIELD_CELL_LINE] = AGGREGATION_NO_VALUE
                normalized_results["query"] = create_query_string(base_query_arguments, BASE_SEARCH_QUERY)
            if isinstance(items := normalized_results.get("items"), list):
                for element in items:
                    add_queries_to_normalized_results(element, base_query_arguments)

    aggregation_field_grouping_cell_or_donor = get_aggregation_field_grouping_cell_or_donor()
    base_query_arguments = create_base_query_arguments(request)
    query = create_query(request, base_query_arguments)

    if not legacy:
        aggregate_by_cell_line_property_name = "aggregate_by_cell_line"
        aggregate_by_cell_line = [
            date_property_name,
            AGGREGATION_FIELD_CELL_LINE,
            AGGREGATION_FIELD_FILE_DESCRIPTOR
        ]
        aggregation_query = {
            aggregate_by_cell_line_property_name: create_aggregation_query(aggregate_by_cell_line)
        }
    else:
        aggregate_by_cell_line_property_name = "aggregate_by_cell_line"
        aggregate_by_cell_line = [
            date_property_name,
            AGGREGATION_FIELD_CELL_LINE,
            AGGREGATION_FIELD_FILE_DESCRIPTOR
        ]
        aggregate_by_donor_property_name = "aggregate_by_donor"
        aggregate_by_donor = [
            date_property_name,
            AGGREGATION_FIELD_DONOR,
            AGGREGATION_FIELD_FILE_DESCRIPTOR
        ]
        aggregation_query = {
            aggregate_by_cell_line_property_name: create_aggregation_query_legacy(aggregate_by_cell_line),
            aggregate_by_donor_property_name: create_aggregation_query_legacy(aggregate_by_donor)
        }

    if debug_query:
        return {"query": query, "aggregation_query": aggregation_query}

    raw_results = execute_aggregation_query(request, query, aggregation_query)

    if raw:
        # For debugging/troubleshooting only if raw=true then return raw ElasticSearch results.
        # And note that unless we remove teh @id property we get redirected to the URL in this field,
        # for example to: /search/?type=OutputFile&status=released&data_category%21=Quality+Control
        #                         &file_status_tracking.released.from=2024-09-30
        #                         &file_status_tracking.released.to=2024-12-31&from=0&limit=0'
        if "@id" in raw_results:
            del raw_results["@id"]
        return raw_results

    if not (raw_results := raw_results.get("aggregations")):
        return {}

    if debug:
        raw_results = deepcopy(raw_results)  # otherwise may be overwritten by below

    prune_elasticsearch_aggregation_results(raw_results)

    if not legacy:
        aggregation_results = raw_results.get(aggregate_by_cell_line_property_name)
    else:
        aggregation_results = merge_elasticsearch_aggregation_results(raw_results.get(aggregate_by_cell_line_property_name),
                                                                 raw_results.get(aggregate_by_donor_property_name))

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

    if debug:
        additional_properties = {
            "debug": {
                "query": query,
                "aggregation_query": aggregation_query,
                "raw_results": raw_results,
                "aggregation_results": deepcopy(aggregation_results)
            }
        }
    else:
        additional_properties = None

    normalized_results = normalize_elasticsearch_aggregation_results(aggregation_results,
                                                                     additional_properties=additional_properties)
    if not legacy:
        fixup_names_values_for_normalized_results(normalized_results)
    if include_queries:
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


def add_info_for_troubleshooting(normalized_results: dict, request: pyramid.request.Request) -> None:

    from encoded.endpoint_utils import get_properties, parse_datetime_string

    def get_files(files, property_name, property_value, map_property_value = None):
        found = []
        for file in files:
            if properties := get_properties(file, property_name):
                if callable(map_property_value):
                    mapped_properties = [] 
                    for value in properties:
                        mapped_properties.append(map_property_value(value))
                    properties = mapped_properties
                if property_value in properties:
                    found.append(file)
        return found

    def map_date_property_value(value):
        if date_value := parse_datetime_string(value):
            return f"{date_value.year}-{date_value.month:02}"
        return value

    def count_uuid(uuid_records: List[dict], uuid: str) -> int:
        count = 0
        for uuid_record in uuid_records:
            if uuid_record.get("uuid") == uuid:
                count += 1
        return count

    def annotate_with_uuids(normalized_results: dict):
        aggregation_fields = [
            AGGREGATION_FIELD_RELEASE_DATE,
            AGGREGATION_FIELD_CELL_MIXTURE,
            AGGREGATION_FIELD_CELL_LINE,
            "file_sets.libraries.analytes.samples.sample_sources.components.cell_culture.display_title",
            "file_sets.libraries.analytes.samples.sample_sources.components.cell_culture.cell_line.code",
            AGGREGATION_FIELD_DONOR,
            AGGREGATION_FIELD_FILE_DESCRIPTOR
        ]
        uuid_records = []
        query = normalized_results.get("query")
        files = request.embed(f"{query}&limit=1000", as_user="IMPORT")["@graph"]
        for first_item in normalized_results["items"]:
            first_property_name = first_item["name"]
            first_property_value = first_item["value"]
            for second_item in first_item["items"]:
                second_property_name = second_item["name"]
                second_property_value = second_item["value"]
                for third_item in second_item["items"]:
                    third_property_name = third_item["name"]
                    third_property_value = third_item["value"]
                    if debug_elasticsearch_hits := third_item.get("debug_elasticsearch_hits"):
                        if not third_item.get("debug"):
                            third_item["debug"] = {}
                        third_item["debug"]["elasticsearch_hits"] = debug_elasticsearch_hits
                        third_item["debug"]["elasticsearch_hits"].sort()
                        del third_item["debug_elasticsearch_hits"]
                    if first_files := get_files(files, first_property_name, first_property_value,
                                                map_property_value=map_date_property_value):
                        if second_files := get_files(first_files, second_property_name, second_property_value):
                            if third_files := get_files(second_files, third_property_name, third_property_value):
                                for file in third_files:
                                    if isinstance(uuid := file.get("uuid"), str):
                                        if not third_item.get("debug"):
                                            third_item["debug"] = {}
                                        if not third_item["debug"].get("portal_hits"):
                                            third_item["debug"]["portal_hits"] = []
                                        uuid_record = {"uuid": uuid}
                                        for aggregation_field in aggregation_fields:
                                            aggregation_values = ", ".join(get_properties(file, aggregation_field))
                                            uuid_record[aggregation_field] = aggregation_values or None
                                        if third_item["debug"].get("elasticsearch_hits"):
                                            uuid_record["elasticsearch_counted"] = \
                                                uuid in third_item["debug"]["elasticsearch_hits"]
                                        third_item["debug"]["portal_hits"].append(uuid_record)
                                        uuid_records.append(uuid_record)
                                if third_item.get("debug", {}).get("portal_hits"):
                                    third_item["debug"]["portal_hits"].sort(key=lambda item: item.get("uuid"))

        for uuid_record in uuid_records:
            if (count := count_uuid(uuid_records, uuid_record["uuid"])) > 1:
                uuid_record["duplicative"] = count

    try:
        annotate_with_uuids(normalized_results)
    except Exception:
        pass
