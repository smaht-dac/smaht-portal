from typing import Any, Dict, Iterable, List, Set

import pytest
from snovault.typeinfo import AbstractTypeInfo, TypeInfo
from webtest.app import TestApp

from .utils import (
    get_all_item_types,
    get_functional_item_types,
    get_item,
    get_schema,
    get_unique_key,
    has_property,
    is_test_item,
)


def test_unique_keys_in_schemas(testapp: TestApp) -> None:
    """Ensure unique keys actually present in schemas."""
    for item_type, type_info in get_all_item_types(testapp).items():
        unique_key = get_unique_key(type_info)
        if unique_key:
            assert has_property(
                type_info.schema, unique_key
            ), f"Unique key {unique_key} not in schema for collection {item_type}"


def test_expected_unique_keys(testapp: TestApp) -> None:
    """Ensure collections have expected unique keys."""
    special_item_types_to_unique_keys = {
        "access_key": "access_key_id",
        "document": None,
        "filter_set": None,
        "image": None,
        "ingestion_submission": None,
        "resource_file": None,
        "meta_workflow": None,
        "meta_workflow_run": None,
        "output_file": None,
        "quality_metric": None,
        "reference_file": None,
        "tracking_item": None,
        "user": "email",
        "workflow": None,
        "workflow_run": None,
    }
    for item_type, type_info in get_all_item_types(testapp).items():
        if is_test_item(item_type):
            continue
        schema = get_schema(testapp, item_type)
        has_submitted_id = has_submitted_id_property(schema)
        has_identifier = has_identifier_property(schema)
        assert not (
            has_submitted_id and has_identifier
        ), f"Unexpected combination of submitted_id and identifier for {item_type}"
        if has_submitted_id:
            assert (
                get_unique_key(type_info) == "submitted_id"
            ), f"Expected submitted_id as unique key for {item_type}"
        if has_identifier:
            assert (
                get_unique_key(type_info) == "identifier"
            ), f"Expected identifier as unique key for {item_type}"
        if not (has_submitted_id or has_identifier):
            assert (
                item_type in special_item_types_to_unique_keys
            ), f"Missing information on expected unique key for {item_type}"
            expected_unique_key = special_item_types_to_unique_keys[item_type]
            if expected_unique_key is None:
                assert not get_unique_key(
                    type_info
                ), f"Expected no unique key for {item_type}"
            else:
                assert (
                    get_unique_key(type_info) == expected_unique_key
                ), f"Expected {expected_unique_key} as unique key for {item_type}"


def has_submitted_id_property(schema: Dict[str, Any]) -> bool:
    """Return True if schema has submitted_id property."""
    return has_property(schema, "submitted_id")


def has_identifier_property(schema: Dict[str, Any]) -> bool:
    """Return True if schema has identifier property."""
    return has_property(schema, "identifier")


@pytest.mark.workbook
def test_unique_key_resource_paths(es_testapp: TestApp, workbook: None) -> None:
    """Ensure unique key defined on item is valid resource path.

    Ensure holds for the collection itself as well as all parent
    collections with the same unique key.
    """
    item_types = get_functional_item_types(es_testapp)
   
    for type_name, type_info in item_types.items():
        unique_key = get_unique_key(type_info)
        if unique_key:
            unique_key_collections = get_collections_for_item_unique_key(type_info)
            example_item = get_item_with_unique_key(es_testapp, type_name, unique_key)
            example_unique_key_value = example_item[unique_key]
            get_item_via_unique_key(
                es_testapp, example_unique_key_value, unique_key_collections
            )


def get_collections_for_item_unique_key(type_info: TypeInfo) -> Set[str]:
    """Get all collections for which the unique key should be valid.

    Includes item type itself, plus all continuous parent collections
    with same unique key.
    """
    collections = set([type_info.name])
    unique_key = get_unique_key(type_info)
    parent_collections = get_parent_collections_with_same_unique_key(
        type_info, unique_key
    )
    return collections.union(parent_collections)


def get_parent_collections_with_same_unique_key(
    type_info: TypeInfo,
    unique_key: str,
) -> Set[str]:
    """Recursively get parent collections with same unique key."""
    parent_types_with_same_unique_key = get_parent_types_with_same_unique_key(
        type_info, unique_key
    )
    if parent_types_with_same_unique_key:
        parent_collections = get_collection_names_for_types(
            parent_types_with_same_unique_key
        )
        grandparent_collections = [
            get_parent_collections_with_same_unique_key(parent_type, unique_key)
            for parent_type in parent_types_with_same_unique_key
        ]
        return parent_collections.union(*grandparent_collections)
    return set()


def get_collection_names_for_types(types: List[TypeInfo]) -> Set[str]:
    return set([type_info.name for type_info in types])


def get_parent_types_with_same_unique_key(
    type_info: TypeInfo, unique_key: str
) -> List[TypeInfo]:
    parent_types = get_parent_types(type_info)
    return [
        parent_type
        for parent_type in parent_types
        if get_unique_key(parent_type) == unique_key
    ]


def get_item_with_unique_key(
    es_testapp: TestApp, type_name: str, unique_key: str
) -> Dict[str, Any]:
    collection_items = get_item(es_testapp, type_name, status=[301, 404])
    items_with_unique_key = [
        item for item in collection_items.get("@graph", []) if item.get(unique_key)
    ]
    assert (
        items_with_unique_key
    ), f"No items with unique key {unique_key} in collection {type_name} in workbook"
    return items_with_unique_key[0]


def get_item_via_unique_key(
    testapp: TestApp,
    unique_key_value: str,
    collection_names: Iterable[str],
) -> None:
    """Ensure unique key is valid resource path for given collections."""
    for collection_name in collection_names:
        get_item(testapp, unique_key_value, collection=collection_name, status=301)


def get_parent_types(type_info: AbstractTypeInfo) -> List[AbstractTypeInfo]:
    """Get base items' type info.

    Straightforward for non-abstract types, but a bit clunky for abstract
    ones since not explicitly defined anywhere.
    """
    all_types = {**type_info.types.by_item_type, **type_info.types.by_abstract_type}
    return [
        item_type_info
        for item_type_info in all_types.values()
        if type_info.name in item_type_info.child_types
    ]
