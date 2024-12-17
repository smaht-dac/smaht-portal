from contextlib import contextmanager
from copy import deepcopy
from pyramid.request import Request as PyramidRequest
from termcolor import colored
from typing import Any, Callable, List, Optional, Tuple, Union
from unittest.mock import patch as patch
from encoded.endpoints.endpoint_utils import parse_datetime_string
from encoded.endpoints.recent_files_summary.recent_files_summary_fields import (
    AGGREGATION_FIELD_RELEASE_DATE,
    AGGREGATION_FIELD_GROUPING_CELL_OR_DONOR,
    AGGREGATION_FIELD_CELL_LINE,
    AGGREGATION_FIELD_CELL_MIXTURE,
    AGGREGATION_FIELD_DONOR,
    AGGREGATION_FIELD_FILE_DESCRIPTOR)

def add_info_for_troubleshooting(normalized_results: dict, request: PyramidRequest) -> None:

    def get_files(files, property_name, property_value, map_property_value = None):
        found = []
        for file in files:
            if properties := _get_properties(file, property_name):
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

    def dedup_list(data: list) -> list:  # noqa
        return list(dict.fromkeys(data)) if isinstance(data, list) else []

    aggregation_fields_for_troubleshooting = dedup_list([
        AGGREGATION_FIELD_RELEASE_DATE,
        AGGREGATION_FIELD_CELL_MIXTURE,
        AGGREGATION_FIELD_CELL_LINE,
        # Store some extra properties for troublehooting (as this whole thing is).
        "file_sets.libraries.analytes.samples.sample_sources.display_title",
        AGGREGATION_FIELD_DONOR,
        AGGREGATION_FIELD_FILE_DESCRIPTOR
    ])

    def annotate_with_uuids(normalized_results: dict):

        def get_unique_release_tracker_description_values(normalized_results: dict) -> List[str]:
            return _get_properties(normalized_results, "items.items.items.value")

        nonlocal aggregation_fields_for_troubleshooting
        unique_release_tracker_description_values = get_unique_release_tracker_description_values(normalized_results)
        uuid_records = []
        query = normalized_results.get("query")
        if isinstance(normalized_results.get("debug"), dict):
            normalized_results["debug"]["aggregation_fields_for_troubleshooting"] = (
                aggregation_fields_for_troubleshooting)
        files = request.embed(f"{query}&limit=1000", as_user="IMPORT")["@graph"]
        for first_item in normalized_results["items"]:
            first_property_name = first_item["name"]
            first_property_value = first_item["value"]
            for second_item in first_item["items"]:
                second_property_name = second_item["name"]
                second_property_value = second_item["value"]
                second_item_items = second_item["items"]
                # Put dummy elements in for AGGREGATION_FIELD_FILE_DESCRIPTOR items values which do not exist.
                third_item_values = [third_item["value"] for third_item in second_item_items]
                for unique_release_tracker_description_value in unique_release_tracker_description_values:
                    if unique_release_tracker_description_value not in third_item_values:
                        second_item["items"].append({
                            "name": AGGREGATION_FIELD_FILE_DESCRIPTOR,
                            "value": unique_release_tracker_description_value,
                            "count": 0,
                            "elasticsearch_counted": False,
                            "debug_placeholder": True
                        })
                third_items_to_delete = []
                for third_item in second_item_items:
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
                                        for aggregation_field in aggregation_fields_for_troubleshooting:
                                            aggregation_values = ", ".join(_get_properties(file, aggregation_field))
                                            uuid_record[aggregation_field] = aggregation_values or None
                                        if third_item["debug"].get("elasticsearch_hits"):
                                            uuid_record["elasticsearch_counted"] = \
                                                uuid in third_item["debug"]["elasticsearch_hits"]
                                        third_item["debug"]["portal_hits"].append(uuid_record)
                                        uuid_records.append(uuid_record)
                                if third_item.get("debug", {}).get("portal_hits"):
                                    third_item["debug"]["portal_hits"].sort(key=lambda item: item.get("uuid"))
                    if ((third_item.get("count") == 0) and
                        (third_item.get("debug_placeholder") is True) and
                        (not third_item.get("debug", {}).get("elasticsearch_hits")) and
                        (not third_item.get("debug", {}).get("portal_hits"))):  # noqa
                        third_items_to_delete.append(third_item)
                if third_items_to_delete:
                    for third_item in third_items_to_delete:
                        second_item_items.remove(third_item)

        for uuid_record in uuid_records:
            if (count := count_uuid(uuid_records, uuid_record["uuid"])) > 1:
                uuid_record["duplicative"] = count

    try:
        annotate_with_uuids(normalized_results)
    except Exception:
        pass


def get_normalized_aggregation_results_as_html_for_troublehshooting(normalized_results: dict,
                                                                    uuids: bool = True,
                                                                    uuid_details: bool = True,
                                                                    query: bool = False,
                                                                    verbose: bool = False,
                                                                    debug: bool = False):
    with _capture_output_to_html(debug=debug) as captured_output:
        print_normalized_aggregation_results_for_troubleshooting(normalized_results,
                                                                 uuids=uuids,
                                                                 uuid_details=uuid_details,
                                                                 query=query,
                                                                 verbose=verbose)
        return captured_output.text


def print_normalized_aggregation_results_for_troubleshooting(normalized_results: dict,
                                                             title: Optional[str] = None,
                                                             parent_grouping_name: Optional[str] = None,
                                                             parent_grouping_value: Optional[str] = None,
                                                             uuids: bool = False,
                                                             uuid_details: bool = False,
                                                             nobold: bool = False,
                                                             checks: bool = False,
                                                             query: bool  = False,
                                                             verbose: bool = False) -> None:

    """
    For deveopment/troubleshooting only ...
    """
    def get_aggregation_fields(normalized_results: dict) -> List[str]:
        # Returns all noted/important aggregation fields which ARE actually being used by the query;
        # we only are interested in ones that are in AGGREGATION_FIELD_GROUPING_CELL_OR_DONOR,
        # which is all of the possible sample-source/cell-line/donor aggregations.
        if not isinstance(aggregation_fields :=
                          normalized_results.get("debug", {}).get("aggregation_query_fields"), list):
            aggregation_fields = []
        else:
            aggregation_fields = deepcopy(aggregation_fields)
        for aggregation_field in aggregation_fields:
            # Remove the ones we are not interested in reporting on.
            if aggregation_field not in AGGREGATION_FIELD_GROUPING_CELL_OR_DONOR:
                aggregation_fields.remove(aggregation_field)
        return aggregation_fields

    def get_aggregation_fields_to_print(normalized_results: dict) -> List[str]:
        aggregation_fields_to_print = get_aggregation_fields(normalized_results)
        if isinstance(aggregation_fields_for_troubleshooting :=
                      normalized_results.get("debug", {}).get("aggregation_fields_for_troubleshooting"), list):
            for aggregation_field_for_troubleshooting in aggregation_fields_for_troubleshooting:
                if aggregation_field_for_troubleshooting not in aggregation_fields_to_print:
                    aggregation_fields_to_print.append(aggregation_field_for_troubleshooting)
            aggregation_fields_to_not_print = [
                AGGREGATION_FIELD_RELEASE_DATE,
                AGGREGATION_FIELD_FILE_DESCRIPTOR 
            ]
            for aggregation_field_to_not_print in aggregation_fields_to_not_print:
                if aggregation_field_to_not_print in aggregation_fields_to_print:
                    aggregation_fields_to_print.remove(aggregation_field_to_not_print)
        return aggregation_fields_to_print

    def get_aggregation_field_labels() -> dict:
        # Shorter/nicer names for aggregation fields of interest to print.
        return {
            AGGREGATION_FIELD_CELL_MIXTURE: "sample-sources",
            AGGREGATION_FIELD_CELL_LINE: "cell-lines",
            AGGREGATION_FIELD_DONOR: "donors",
            "file_sets.libraries.analytes.samples.sample_sources.display_title": "sample-sources-title"
        }

    def print_results(data: dict,
                      parent_grouping_name: Optional[str] = None,
                      parent_grouping_value: Optional[str] = None,
                      indent: int = 0) -> None:

        nonlocal title, uuids, uuid_details, nobold, query, verbose
        nonlocal chars_check, chars_dot, chars_rarrow_hollow, chars_xmark, red, green, green_bold, gray, bold
        nonlocal aggregation_fields_to_print

        def get_portal_hits(data: dict) -> List[dict]:
            hits = []
            if isinstance(data, dict) and isinstance(portal_hits := data.get("debug", {}).get("portal_hits"), list):
                for portal_hit in portal_hits:
                    if isinstance(portal_hit, dict) and isinstance(uuid := portal_hit.get("uuid"), str) and uuid:
                        hits.append(portal_hit)
            return hits

        def count_unique_portal_hits_recursively(data: dict) -> int:
            def get_portal_hits_recursively(data: dict) -> List[dict]:  # noqa
                hits = []
                if isinstance(data, dict):
                    for key in data:
                        if key == "portal_hits":
                            if isinstance(data[key], list):
                                hits.extend(data[key])
                        else:
                            hits.extend(get_portal_hits_recursively(data[key]))
                elif isinstance(data, list):
                    for element in data:
                        hits.extend(get_portal_hits_recursively(element))
                return hits
            hits = get_portal_hits_recursively(data)
            hits = [hit.get("uuid") for hit in hits]
            return len(set(hits))

        def format_hit_property_values(hit: dict, property_name: str,
                                       color: Optional[Callable] = None) -> Tuple[Optional[str], List[Tuple[str, str]]]:
            nonlocal parent_grouping_name, parent_grouping_value, green, green_bold, chars_larrow_hollow
            counted_elsewhere = []
            if hit.get("elasticsearch_counted", False) is False:
                counted_grouping_name, counted_grouping_value = find_where_aggregated_and_counted(hit.get("uuid"))
            else:
                counted_grouping_name, counted_grouping_value = (None, None)
            if property_value := hit.get(property_name):
                if property_name == parent_grouping_name:
                    property_values = []
                    for property_value in property_value.split(","):
                        if (property_value := property_value.strip()) == parent_grouping_value:
                            property_value = color(property_value) if callable(color) else green_bold(property_value)
                            property_values.append(property_value)
                        else:
                            if (counted_grouping_name, counted_grouping_value) == (property_name, property_value):
                                property_values.append(green_bold(f"{property_value} {chars_larrow_hollow}") +
                                                       green(" COUNTED HERE"))
                                counted_elsewhere.append((counted_grouping_name, counted_grouping_value))
                            else:
                                property_values.append(property_value)
                    property_value = ", ".join(property_values)
                elif hit.get("elasticsearch_counted", False) is False:
                    counted_grouping_name, counted_grouping_value = find_where_aggregated_and_counted(hit.get("uuid"))
                    if (counted_grouping_name == property_name) and (counted_grouping_value == property_value):
                        property_value = green_bold(f"{property_value} {chars_larrow_hollow}") + green(" COUNTED HERE")
                        counted_elsewhere.append((counted_grouping_name, counted_grouping_value))
            return property_value, counted_elsewhere

        def find_where_aggregated_and_counted(
                uuid: str,
                multiple: bool = False,
                ignore: Optional[Union[List[Tuple[str, str]],
                Tuple[str, str]]] = None) -> Union[Tuple[str, str], List[Tuple[str, str]]]:

            nonlocal normalized_results

            def find_where(data: dict, uuid: str,
                           parent_grouping_name: Optional[str] = None,
                           parent_grouping_value: Optional[str] = None) -> List[Tuple[str, str]]:
                found_uuid_grouping_names_and_values = set()
                if isinstance(data, dict):
                    grouping_name = data.get("name")
                    grouping_value = data.get("value")
                    if isinstance(items := data.get("items"), list):
                        for item in items:
                            if found := find_where(item, uuid,
                                                   parent_grouping_name=grouping_name,
                                                   parent_grouping_value=grouping_value):
                                found_uuid_grouping_names_and_values.update(found)
                    elif isinstance(hits := data.get("debug", {}).get("portal_hits"), list):
                        for hit in hits:
                            if hit.get("uuid") == uuid:
                                if hit.get("elasticsearch_counted", False) is True:
                                    found_uuid_grouping_names_and_values.add((parent_grouping_name, parent_grouping_value))
                return found_uuid_grouping_names_and_values

            if found_uuid_grouping_names_and_values := list(find_where(normalized_results, uuid)):
                if isinstance(ignore, tuple) and (len(ignore) == 2) and (ignore in found_uuid_grouping_names_and_values):
                    found_uuid_grouping_names_and_values.remove(ignore)
                elif isinstance(ignore, list):
                    for ignore_item in ignore:
                        if isinstance(ignore_item, tuple) and (len(ignore_item) == 2) and (ignore_item in found_uuid_grouping_names_and_values):
                            found_uuid_grouping_names_and_values.remove(ignore_item)
                if multiple is True:
                    return found_uuid_grouping_names_and_values
                if len(found_uuid_grouping_names_and_values) > 1:
                    # Normally should only be at most one item with elasticsearch_counted set to True.
                    pass
                return found_uuid_grouping_names_and_values[0]
            return [(None, None)] if multiple is True else (None, None)

        def print_hit_property_values(hit: dict, property_name: str,
                                      label: Optional[str] = None,
                                      prefix: Optional[str] = None,
                                      color: Optional[Callable] = None) -> List[Tuple[str, str]]:
            nonlocal aggregation_fields, aggregation_field_labels, chars_dot_hollow, chars_null, verbose
            if not label:
                label = aggregation_field_labels.get(property_name)
            if (verbose is True) or (not label):
                label = property_name
            property_values, counted_elsewhere = format_hit_property_values(hit, property_name, color=color)
            if not property_values:
                property_values = chars_null
            if property_name not in aggregation_fields:
                property_description = f"{prefix or ''}{chars_dot_hollow} {label}: {property_values}"
                property_description = gray(property_description)
            else:
                property_description = f"{prefix or ''}{chars_dot} {label}: {property_values}"
            print(property_description)
            return counted_elsewhere

        if not (isinstance(data, dict) and data):
            return
        if not (isinstance(indent, int) and (indent > 0)):
            indent = 0
        spaces = (" " * indent) if indent > 0 else ""
        grouping_name = data.get("name")
        if isinstance(grouping_value := data.get("value"), str) and grouping_value:
            grouping = bold(grouping_value)
            if (verbose is True) and isinstance(grouping_name, str) and grouping_name:
                grouping = f"{grouping_name} {chars_dot} {grouping}"
        elif not (isinstance(grouping := title, str) and grouping):
            grouping = "RESULTS"
        grouping = f"{chars_diamond} {grouping}"
        hits = get_portal_hits(data) if (uuids is True) else []
        note = ""
        if isinstance(count := data.get("count"), int):
            if (len(hits) > count) and (uuids is True):
                note = red(f" {chars_rarrow_hollow} MORE ACTUAL RESULTS: {len(hits) - count}")
                if count == 0:
                    note = red(f' {chars_rarrow_hollow} UNCOUNTED') + note
            elif isinstance(items := data.get("items"), list):
                subcount = 0
                for item in items:
                    if isinstance(subcount_item := item.get("count"), int):
                        subcount += subcount_item
                if subcount != count:
                    note = red(f" {chars_xmark} ACTUAL COUNT: {subcount}")
                elif checks is True:
                    note = f" {chars_check}"
            elif checks:
                note = f" {chars_check}"
        if not ((count == 0) and (len(hits) == 0) and (not note)):
            if (len(hits) == 0) and isinstance(items := data.get("items"), list):
                # Count the actual hits for this non-terminal group.
                if ((items_nhits := count_unique_portal_hits_recursively(items)) > count) and (uuids is True):
                    note += red(f" {chars_rarrow_hollow} MORE ACTUAL RESULTS: {items_nhits - count}")
                    if count == 0:
                        note = red(f' {chars_rarrow_hollow} UNCOUNTED') + note
            print(f"{spaces}{grouping}: {count}{note}")
            if (query is True) and (query_string := data.get("query")):
                if _terminal_color == _html_color:
                    print(f"{spaces}  <small><a target=_blank href='{query_string}'>{query_string}</a></small>")
                else:
                    print(f"{spaces}  {query_string}")
        for hit in hits:
            if isinstance(hit, dict) and isinstance(uuid := hit.get("uuid"), str) and uuid:
                if hit.get("elasticsearch_counted", False) is False:
                    print(red(f"{spaces}  {chars_dot} {uuid} {chars_xmark} UNCOUNTED"))
                    color = red_bold
                else:
                    print(f"{spaces}  {chars_dot} {uuid} {chars_check}")
                    color = green_bold
                if uuid_details is True:
                    prefix =  f"{spaces}    "
                    counted_elsewhere = []
                    # Show property values for troubleshooting (as this whole thing is);
                    # see add_info_for_troubleshooting.annotate_with_uuids.
                    for aggregation_field in aggregation_fields_to_print:
                        hit_counted_elsewhere = \
                            print_hit_property_values(hit, aggregation_field, prefix=prefix, color=color)
                        if hit_counted_elsewhere:
                            counted_elsewhere.extend(hit_counted_elsewhere)
                    # See if also grouped elsewhere for our FYI.
                    duplicative = hit.get("duplicative")
                    duplicates = duplicative - 1 if isinstance(duplicative, int) else 0
                    counted_groupings = find_where_aggregated_and_counted(
                        hit.get("uuid"), multiple=True,
                        ignore=counted_elsewhere + [(parent_grouping_name, parent_grouping_value)])
                    if counted_groupings:
                        message = f"{spaces}    {green(chars_rarrow_hollow)} {green('ALSO COUNTED HERE')}:"
                        if verbose is True:
                            if duplicates > 0:
                                message += f" {duplicates}"
                                if duplicates != len(counted_groupings):
                                    message += red_bold(f" {chars_xmark} vs {len(counted_groupings)}")
                            print(message)
                            for counted_grouping in counted_groupings:
                                print(f"{spaces}      - {counted_grouping[0]} {green(counted_grouping[1])}")
                        else:
                            counted_grouping_values = [green(counted_grouping[1]) for counted_grouping in counted_groupings]
                            message = f"{message} {', '.join(counted_grouping_values)}"
                            if duplicates > 0:
                                if duplicates != len(counted_groupings):
                                    message += red_bold(f" {chars_xmark} {duplicates} vs {len(counted_grouping_values)}")
                            print(message)
        if isinstance(items := data.get("items"), list):
            for element in items:
                print_results(element,
                              parent_grouping_name=grouping_name,
                              parent_grouping_value=grouping_value,
                              indent=indent + 2)

    aggregation_fields = get_aggregation_fields(normalized_results)
    aggregation_fields_to_print = get_aggregation_fields_to_print(normalized_results)
    aggregation_field_labels = get_aggregation_field_labels()

    red = lambda text: _terminal_color(text, "red")  # noqa
    red_bold = lambda text: _terminal_color(text, "red", bold=True)  # noqa
    green = lambda text: _terminal_color(text, "green")  # noqa
    green_bold = lambda text: _terminal_color(text, "green", bold=True)  # noqa
    gray = lambda text: _terminal_color(text, "grey")  # noqa
    bold = (lambda text: _terminal_color(text, bold=True)) if (nobold is not True) else (lambda text: text)
    chars_check = "✓"
    chars_xmark = "✗"
    chars_dot = "•"
    chars_dot_hollow = "◦"
    chars_diamond = "❖"
    chars_rarrow_hollow = "▷"
    chars_larrow_hollow = "◁"
    chars_null = "∅"

    print_results(normalized_results)


def _get_properties(data: dict, name: str, fallback: Optional[Any] = None, sort: bool = False) -> List[Any]:
    """
    TODO: Move this to dcicutils. Maybe much of the above too.
    Returns the values of the given property name within the given dictionary as a list, where the
    given property name can be a dot-separated list of property names, which indicate a path into
    nested dictionaries within the given dictionary; and - where if any of the elements within
    the path are lists then we iterate through each, collecting the values for each and including
    each within the list of returned values.
    """
    if isinstance(data, dict) and isinstance(name, str) and name:
        if keys := name.split("."):
            nkeys = len(keys) ; key_index_max = nkeys - 1  # noqa
            for key_index in range(nkeys):
                if (value := data.get(keys[key_index], None)) is not None:
                    if key_index == key_index_max:
                        return [value] if not isinstance(value, list) else value
                    elif isinstance(value, dict):
                        data = value
                        continue
                    elif isinstance(value, list) and value and ((sub_key_index := key_index + 1) < nkeys):
                        sub_key = ".".join(keys[sub_key_index:])
                        values = []
                        for element in value:
                            if isinstance(element_value := _get_properties(element, sub_key), list):
                                for element_value_item in element_value:
                                    if (element_value_item is not None) and (element_value_item not in values):
                                        values.append(element_value_item)
                            elif (element_value is not None) and (element_value not in values):
                                values.append(element_value)
                        return sorted(values) if (sort is True) else values
                break
    return fallback if isinstance(fallback, list) else ([] if fallback is None else [fallback])


def colored_html(value: str, color: Optional[str] = None, attrs: Optional[list] = None) -> str:
    if isinstance(value, str):
        if isinstance(color, str) and color:
            value = f"<span style='color: {color}'>{value}</span>"
        if isinstance(attrs, list):
            if "bold" in attrs:
                value = f"<b>{value}</b>"
    return value


def _terminal_color(value: str,
                    color: Optional[str] = None,
                    dark: bool = False,
                    bold: bool = False,
                    underline: bool = False,
                    nocolor: bool = False) -> str:
    # This is used only for troubleshooting by
    if nocolor is True:
        return value
    attributes = []
    if dark is True:
        attributes.append("dark")
    if bold is True:
        attributes.append("bold")
    if underline is True:
        attributes.append("underline")
    if isinstance(color, str) and color:
        return colored(value, color.lower(), attrs=attributes)
    return colored(value, attrs=attributes)


def _html_color(value: str,
                color: Optional[str] = None,
                dark: bool = False,
                bold: bool = False,
                underline: bool = False,
                nocolor: bool = False) -> str:
    if (nocolor is not True) and isinstance(value, str):
        if isinstance(color, str) and color:
            if dark is True:
                value = f"<span style='color: dark{color}'>{value}</span>"
            else:
                value = f"<span style='color: {color}'>{value}</span>"
        if bold is True:
            value = f"<b>{value}</b>"
        if underline is True:
            value = f"<u>{value}</u>"
    return value


@contextmanager
def _capture_output_to_html(debug: bool = False):

    captured_output = ""
    class CapturedOutput:  # noqa
        @property  # noqa
        def text(self):
            nonlocal captured_output
            return captured_output
    def captured_print(*args, **kwargs):  # noqa
        nonlocal captured_output
        captured_output += str(args[0]) + "\n"
    this_module = "encoded.endpoints.recent_files_summary.recent_files_summary_troubleshooting"
    if debug is True:
        with patch(f"{this_module}.print", captured_print):
            yield CapturedOutput()
    else:
        with (patch(f"{this_module}.print", captured_print), patch(f"{this_module}._terminal_color", _html_color)):
            yield CapturedOutput()
