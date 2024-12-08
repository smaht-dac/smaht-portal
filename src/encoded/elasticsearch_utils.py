from copy import deepcopy
from typing import Any, Callable, List, Optional, Tuple, Union

AGGREGATION_MAX_BUCKETS = 100
AGGREGATION_NO_VALUE = "No value"


def create_elasticsearch_aggregation_query(fields: List[str],
                                           property_name: Optional[str] = None,
                                           max_buckets: Optional[int] = None,
                                           missing_value: Optional[str] = None,
                                           include_missing: bool = False,
                                           create_field_aggregation: Optional[Callable] = None,
                                           _toplevel: bool = True) -> dict:

    """
    Returns a dictionary representing an ElasticSearch aggregation query for the field names.
    If more than one is given the the aggregation will be nested, one within another, for example,
    given ["date_created", "donors.display_title", "release_tracker_description"] we would return
    something like this:

      {
        "aggregate_by_donor": {
          "meta": { "field_name": "date_created" },
          "filter": {
            "bool": {
              "must": [
                {"exists": {"field": "embedded.date_created.raw"}},
                {"exists": {"field": "embedded.donors.display_title.raw"}},
                {"exists": {"field": "embedded.release_tracker_description.raw"}}
              ]
            }
          },
          "aggs": {
            "dummy_date_histogram": {
              "date_histogram": {
                "field": "embedded.date_created",
                "calendar_interval": "month",
                "format": "yyyy-MM", "missing": "1970-01",
                "order": { "_key": "desc"}
              },
              "aggs": {
                "donors.display_title": {
                  "meta": {"field_name": "donors.display_title"},
                  "terms": {
                    "field": "embedded.donors.display_title.raw",
                    "missing": "No value", "size": 100
                  },
                  "aggs": {
                    "release_tracker_description": {
                      "meta": {"field_name": "release_tracker_description"},
                      "terms": {
                        "field": "embedded.release_tracker_description.raw",
                        "missing": "No value", "size": 100
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

    The above example assumes that a create_field_aggregation function callable was passed as an argument
    and that if/when its argument is date_created then it would have returned something like this 

      {
        "date_histogram": {
          "field": f"embedded.date_created",
          "calendar_interval": "month",
          "format": "yyyy-MM",
          "missing": "1970-01",
          "order": {"_key": "desc"}
        }
      }

    It further assumes, that the include_missing argument is False (default), in which case items not part of
    any of the specified aggregation fields would be filtered out. This demonstrates a slight complication with
    this particular case where an extra level of aggregation needs to be introducts (dummy_date_histogram).
    This extra bit of cruft, necessary to get the ElasticSearch query to work as expected, manifests itself in
    the query result as well and is dispensed with using the prune_elasticsearch_aggregation_results function below.
    """
    global AGGREGATION_MAX_BUCKETS, AGGREGATION_NO_VALUE

    if isinstance(fields, str):
        fields = [fields]
    if not (isinstance(fields, list) and fields and isinstance(field := fields[0], str) and (field := field.strip())):
        return {}
    if not isinstance(missing_value, str):
        missing_value = AGGREGATION_NO_VALUE
    if not (isinstance(max_buckets, int) and (max_buckets > 0)):
        max_buckets = AGGREGATION_MAX_BUCKETS

    if not (callable(create_field_aggregation) and
            isinstance(field_aggregation := create_field_aggregation(field), dict)):
        field_aggregation = {
            "terms": {
                "field": f"embedded.{field}.raw",
                "missing": missing_value,
                "size": max_buckets
            }
        }

    if not (isinstance(property_name, str) and (property_name := property_name.strip())):
        property_name = field

    aggregation = {property_name: {"meta": {"field_name": field}}}

    if (include_missing is not True) and (_toplevel is True):
        # Filtering out items which are not in any of the aggregations; this introduces complication if
        # using date_histogram rather than simple terms, which we need add another level of aggregation
        # just for the date_histogram; then the caller will need deal with (remove) it later.
        extra_nesting_for_date_histogram_and_filter = "date_histogram" in field_aggregation
        for field in fields:
            if isinstance(field, str) and (field := field.strip()):
                if not aggregation[property_name].get("filter"):
                    aggregation[property_name]["filter"] = {"bool": {"must": []}}
                aggregation[property_name]["filter"]["bool"]["must"].append({
                    "exists": {
                        "field": f"embedded.{field}.raw"
                    }
                })
    else:
        extra_nesting_for_date_histogram_and_filter = False

    if not extra_nesting_for_date_histogram_and_filter:
        aggregation[property_name].update(field_aggregation)

    if nested_aggregation := create_elasticsearch_aggregation_query(
            fields[1:], max_buckets=max_buckets,
            missing_value=missing_value,
            create_field_aggregation=create_field_aggregation, _toplevel=False):
        if extra_nesting_for_date_histogram_and_filter:
            aggregation[property_name]["aggs"] = \
                {"dummy_date_histogram": {**field_aggregation, "aggs": nested_aggregation}}
        else:
            aggregation[property_name]["aggs"] = nested_aggregation
    return aggregation


def prune_elasticsearch_aggregation_results(results: dict) -> None:
    """
    This removes any extra level(s) of aggregation (i.e. dummy_date_histogram) that may have been
    introduced in the create_elasticsearch_aggregation_query function (above), for when/if both
    a filter and a date_histogram are used together.
    """
    if isinstance(results, dict):
        for key in list(results.keys()):
            if (key == "dummy_date_histogram") and isinstance(buckets := results[key].get("buckets"), list):
                results["buckets"] = buckets
                del results[key]
            else:
                prune_elasticsearch_aggregation_results(results[key])
    elif isinstance(results, list):
        for element in results:
            prune_elasticsearch_aggregation_results(element)


def merge_elasticsearch_aggregation_results(target: dict, source: dict, copy: bool = False) -> Optional[dict]:
    """
    Merges the given second (source) argument into the given first (target) argument (in palce), recursively, both
    of which are assumed to be ElasticSearch aggregation query results; doc_coiunt values are updated as expected.
    If the given copy argument is True then then the merge is not done to the given target in-place, rather a copy
    of it is made and the merge done to it. In eiter case the resultant merged target is returned. For example:

      target = {
        "meta": { "field_name": "date_created" }, "doc_count": 15,
        "buckets": [
          {
            "key_as_string": "2024-12", "key": 1733011200000, "doc_count": 13,
            "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
                "meta": { "field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code" },
                "buckets": [
                    {
                        "key": "COLO829T", "doc_count": 7,
                        "release_tracker_description": {
                            "meta": { "field_name": "release_tracker_description" },
                            "buckets": [
                                { "key": "WGS ONT PromethION 24 bam", "doc_count": 1 }
                            ]
                        }
                    }
                ]
            }
          }
        ]
      }

      source = {
        "meta": { "field_name": "date_created" }, "doc_count": 16,
        "buckets": [
          {
            "key_as_string": "2024-12", "key": 1733011200000, "doc_count": 14,
            "donors.display_title": {
              "meta": { "field_name": "donors.display_title" },
              "buckets": [
                {
                  "key": "DAC_DONOR_COLO829", "doc_count": 12,
                  "release_tracker_description": {
                    "meta": { "field_name": "release_tracker_description" },
                    "buckets": [
                      { "key": "Fiber-seq PacBio Revio bam", "doc_count": 4 }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }

      merge_elasticsearch_aggregation_results(target, source) == {
        "meta": { "field_name": "date_created" }, "doc_count": 15,
        "buckets": [
          {
            "key_as_string": "2024-12", "key": 1733011200000, "doc_count": 25,
            "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
              "meta": { "field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code" },
              "buckets": [
                {
                  "key": "COLO829T", "doc_count": 7,
                  "release_tracker_description": {
                    "meta": { "field_name": "release_tracker_description" },
                    "buckets": [
                      { "key": "WGS ONT PromethION 24 bam", "doc_count": 1 }
                    ]
                  }
                }
              ]
            },
            "donors.display_title": {
              "meta": { "field_name": "donors.display_title" },
              "buckets": [
                {
                  "key": "DAC_DONOR_COLO829", "doc_count": 12,
                  "release_tracker_description": {
                    "meta": { "field_name": "release_tracker_description" },
                    "buckets": [
                      { "key": "Fiber-seq PacBio Revio bam", "doc_count": 4 }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    """

    def get_aggregation_key(aggregation: dict, aggregation_key: Optional[str] = None) -> Optional[str]:
        if isinstance(aggregation, dict) and isinstance(aggregation.get("buckets"), list):
            if isinstance(field_name := aggregation.get("meta", {}).get("field_name"), str) and field_name:
                if isinstance(aggregation_key, str) and aggregation_key:
                    if field_name != aggregation_key:
                        return None
                return field_name
        return None

    def get_nested_aggregation(aggregation: dict) -> Optional[dict]:
        if isinstance(aggregation, dict):
            for key in aggregation:
                if get_aggregation_key(aggregation[key], key):
                    return aggregation[key]
        return None

    def get_aggregation_bucket_value(aggregation_bucket: dict) -> Optional[Any]:
        if isinstance(aggregation_bucket, dict):
            return aggregation_bucket.get("key_as_string", aggregation_bucket.get("key"))
        return None

    def get_aggregation_bucket_doc_count(aggregation_bucket: dict) -> Optional[int]:
        if isinstance(aggregation_bucket, dict):
            if isinstance(doc_count := aggregation_bucket.get("doc_count"), int):
                return doc_count
        return None

    def get_aggregation_buckets_doc_count(aggregation: dict):
        buckets_doc_count = 0
        if get_aggregation_key(aggregation):
            for aggregation_bucket in aggregation["buckets"]:
                if (doc_count := get_aggregation_bucket_doc_count(aggregation_bucket)) is not None:
                    buckets_doc_count += doc_count
        return buckets_doc_count

    def find_aggregation_bucket(aggregation: dict, value: str) -> Optional[dict]:
        if get_aggregation_key(aggregation):
            for aggregation_bucket in aggregation["buckets"]:
                if get_aggregation_bucket_value(aggregation_bucket) == value:
                    return aggregation_bucket
        return None

    def merge_results(target: dict, source: dict) -> Tuple[Optional[dict], Optional[int]]:
        merged_item_count = 0
        if not ((aggregation_key := get_aggregation_key(source)) and (get_aggregation_key(target) == aggregation_key)):
            return None, None
        for source_bucket in source["buckets"]:
            if (((source_bucket_value := get_aggregation_bucket_value(source_bucket)) is None) or
                ((source_bucket_item_count := get_aggregation_bucket_doc_count(source_bucket)) is None)):  # noqa
                continue
            if (target_bucket := find_aggregation_bucket(target, source_bucket_value)):
                if source_nested_aggregation := get_nested_aggregation(source_bucket):
                    if target_nested_aggregation := get_nested_aggregation(target_bucket):
                        merged_item_count, _ = merge_results(target_nested_aggregation, source_nested_aggregation)
                        if merged_item_count is None:
                            if source_nested_aggregation_key := get_aggregation_key(source_nested_aggregation):
                                target_bucket[source_nested_aggregation_key] = \
                                    source_bucket[source_nested_aggregation_key]
                                target_bucket["doc_count"] += \
                                    get_aggregation_buckets_doc_count(source_bucket[source_nested_aggregation_key])
                        elif merged_item_count > 0:
                            target_bucket["doc_count"] += merged_item_count
                elif get_aggregation_bucket_value(target_bucket) is not None:
                    if get_aggregation_bucket_doc_count(target_bucket) is not None:
                        target_bucket["doc_count"] += source_bucket_item_count
                        merged_item_count += source_bucket_item_count
            else:
                target["buckets"].append(source_bucket)
                if isinstance(target.get("doc_count"), int):
                    target["doc_count"] += source_bucket_item_count
                else:
                    target["doc_count"] = source_bucket_item_count
        return merged_item_count, target

    if copy is True:
        target = deepcopy(target)
    return merge_results(target, source)[1]


def normalize_elasticsearch_aggregation_results(aggregation: dict, additional_properties: Optional[dict] = None,
                                                remove_empty_items: bool = True) -> dict:

    """
    Normalizes the given result of an ElasticSearch aggregation query into a more readable/consumable format.
    For example, given the result of the the example for merge_elasticsearch_aggregation_results above as input,
    this function would return something like this:

      normalize_elasticsearch_aggregation_results(aggregation_results) == {
        "count": 25,
        "items": [
          {
            "name": "date_created",
            "value": "2024-12", "count": 11,
            "items": [
              {
                "name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code",
                "value": "COLO829T", "count": 1,
                "items": [
                  {
                    "name": "release_tracker_description",
                    "value": "WGS ONT PromethION 24 bam", "count": 1
                  }
                ]
              },
              {
                "name": "donors.display_title",
                "value": "DAC_DONOR_COLO829", "count": 4,
                "items": [
                  {
                    "name": "release_tracker_description",
                    "value": "Fiber-seq PacBio Revio bam", "count": 4
                  }
                ]
              }
            ]
          }
        ]
      }
    """

    def get_aggregation_key(aggregation: dict, aggregation_key: Optional[str] = None) -> Optional[str]:
        # TODO: same as in merge_elasticsearch_aggregation_results function
        if isinstance(aggregation, dict) and isinstance(aggregation.get("buckets"), list):
            if isinstance(field_name := aggregation.get("meta", {}).get("field_name"), str) and field_name:
                if isinstance(aggregation_key, str) and aggregation_key:
                    if field_name != aggregation_key:
                        return None
                return field_name
        return None

    def get_aggregation_bucket_value(aggregation_bucket: dict) -> Optional[Any]:
        # TODO: same as in merge_elasticsearch_aggregation_results function
        if isinstance(aggregation_bucket, dict):
            return aggregation_bucket.get("key_as_string", aggregation_bucket.get("key"))
        return None

    def get_aggregation_bucket_doc_count(aggregation_bucket: dict) -> Optional[int]:
        # TODO: same as in merge_elasticsearch_aggregation_results function
        if isinstance(aggregation_bucket, dict):
            if isinstance(doc_count := aggregation_bucket.get("doc_count"), int):
                return doc_count
        return None

    def get_nested_aggregations(data: dict) -> List[dict]:
        results = []
        if isinstance(data, dict):
            for key in data:
                if get_aggregation_key(data[key]) and data[key]["buckets"]:
                    results.append(data[key])
            if not results:
                if ((isinstance(data.get("buckets"), list) and data["buckets"]) or
                    (isinstance(data.get("key"), str) and isinstance(data.get("doc_count"), int))):  # noqa
                    results.append(data)
        return results

    def find_group_item(group_items: List[dict], value: Any) -> Optional[dict]:
        if isinstance(group_items, list):
            for group_item in group_items:
                if isinstance(group_item, dict) and (value == group_item.get("value")):
                    return group_item
        return None

    def normalize_results(aggregation: dict,
                          key: Optional[str] = None, value: Optional[str] = None,
                          additional_properties: Optional[dict] = None) -> dict:

        nonlocal remove_empty_items

        if not (aggregation_key := get_aggregation_key(aggregation)):
            return {}

        group_items = [] ; item_count = 0  # noqa
        for bucket in aggregation["buckets"]:
            if (((bucket_value := get_aggregation_bucket_value(bucket)) is None) or
                ((bucket_item_count := get_aggregation_bucket_doc_count(bucket)) is None)):  # noqa
                continue
            item_count += bucket_item_count
            if nested_aggregations := get_nested_aggregations(bucket):
                for nested_aggregation in nested_aggregations:
                    if normalized_aggregation := normalize_results(nested_aggregation, aggregation_key, bucket_value):
                        if group_item := find_group_item(group_items, bucket_value):
                            for normalized_aggregation_item in normalized_aggregation["items"]:
                                group_item["items"].append(normalized_aggregation_item)
                                group_item["count"] += normalized_aggregation_item["count"]
                        else:
                            group_item = normalized_aggregation
                            group_items.append(group_item)
                    else:
                        if (remove_empty_items is False) or (bucket_item_count > 0):
                            group_item = {"name": aggregation_key, "value": bucket_value, "count": bucket_item_count}
                            group_items.append(group_item)

        if (remove_empty_items is not False) and (not group_items):
            return {}
        results = {"name": key, "value": value, "count": item_count, "items": group_items}

        if isinstance(additional_properties, dict) and additional_properties:
            results = {**additional_properties, **results}

        if key is None:
            del results["name"]
            if value is None:
                del results["value"]

        return results

    results = normalize_results(aggregation, additional_properties=additional_properties)
    return results


def sort_normalized_aggregation_results(data: dict, sort: Union[bool, str, Callable,
                                                                   List[Union[bool, str, Callable]]] = False) -> None:

    """
    Sorts the given *normalized* (see above) ElasticSearch aggregation results.
    By default, this is by item (doc) count descending and secondarily by key value.
    """

    def sort_items(items: List[dict], sort: Union[bool, str, Callable]) -> None:
        sort_function_default = lambda item: (-item.get("count", 0), item.get("value", ""))  # noqa
        if (sort is True) or (isinstance(sort, str) and (sort.strip().lower() == "default")):
            items.sort(key=sort_function_default)
        elif isinstance(sort, str) and (sort := sort.strip().lower()):
            if sort.startswith("-"):
                sort_reverse = True
                sort = sort[1:]
            else:
                sort_reverse = False
            if sort == "default":
                items.sort(key=sort_function_default, reverse=sort_reverse)
            elif (sort in ["key", "value"]):
                items.sort(key=lambda item: item.get("value", ""), reverse=sort_reverse)
        elif callable(sort):
            items.sort(key=lambda item: sort(item))

    def sort_results(data: dict, level: int = 0) -> None:
        nonlocal sort
        if isinstance(sort, list) and sort:
            if level < len(sort):
                sort_level = sort[level]
            else:
                sort_level = sort[len(sort) - 1]
        else:
            sort_level = sort
        if isinstance(data, dict) and isinstance(items := data.get("items"), list):
            sort_items(items, sort=sort_level)
            for item in items:
                sort_results(item, level=level + 1)

    sort_results(data)
