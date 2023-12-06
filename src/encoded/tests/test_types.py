from typing import Any, Dict, Iterable, List, Set, Union

import pytest
from pyramid.registry import Registry
from snovault import Collection, COLLECTIONS
from snovault.typeinfo import AbstractTypeInfo, TypeInfo
from webtest.app import TestApp

from .utils import get_item, get_functional_item_types


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
        parent_type for parent_type in parent_types
        if get_unique_key(parent_type) == unique_key
    ]


def get_item_with_unique_key(
    es_testapp: TestApp, type_name: str, unique_key: str
) -> Dict[str, Any]:
    collection_items = get_item(es_testapp, type_name, status=[301, 404])
    items_with_unique_key = [
        item for item in collection_items.get("@graph", []) if item.get(unique_key)
    ]
    assert items_with_unique_key, (
        f"No items with unique key {unique_key} in collection {type_name} in workbook"
    )
    return items_with_unique_key[0]


def get_item_via_unique_key(
    testapp: TestApp,
    unique_key_value: str,
    collection_names: Iterable[str],
) -> None:
    """Ensure unique key is valid resource path for given collections."""
    for collection_name in collection_names:
        get_item(testapp, unique_key_value, collection=collection_name, status=301)


def get_unique_key(type_info: AbstractTypeInfo) -> str:
    """Get unique key for given item type."""
    type_collection = get_collection_for_type(type_info)
    return get_unique_key_property_name(type_collection)


def get_collection_for_type(type_info: AbstractTypeInfo) -> Collection:
    """Get collection from type info.

    Assumes existence of collection in registry.
    """
    type_name = type_info.name
    registry = get_registry(type_info)
    result = get_collection_for_item_name(registry, type_name)
    return result


def get_registry(type_info: TypeInfo) -> Registry:
    return type_info.types.registry


def get_collection_for_item_name(
    registry: Registry, item_name: str
) -> Union[Collection, None]:
    return registry.get(COLLECTIONS, {}).get(item_name)


def get_unique_key_property_name(collection: Collection) -> str:
    """Get property name for unique key on collection, if defined.

    Parse unique key from 'collection:unique_key' format, if required.
    """
    unique_key = collection.unique_key
    if unique_key is None:
        return ""
    if ":" in unique_key:
        return "".join(unique_key.split(":")[1:])
    return unique_key


def get_parent_types(type_info: AbstractTypeInfo) -> List[AbstractTypeInfo]:
    """Get base items' type info.

    Straightforward for non-abstract types, but a clunky for abstract
    ones since not explicitly defined anywhere.
    """
    all_types = {**type_info.types.by_item_type, **type_info.types.by_abstract_type}
    return [
        item_type_info for item_type_info in all_types.values()
        if type_info.name in item_type_info.child_types
    ]


def get_type_for_item_name(registry: Registry, item_name: str) -> TypeInfo:
    collection = get_collection_for_item_name(registry, item_name)
    return collection.type_info
