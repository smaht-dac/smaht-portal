import json
import pkg_resources
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from dcicutils.misc_utils import to_camel_case, to_snake_case
from dcicutils import schema_utils
from pyramid.registry import Registry
from snovault import Collection, COLLECTIONS, TYPES
from snovault.typeinfo import AbstractTypeInfo, TypeInfo
from webtest.app import TestApp


def post_item_and_return_location(
    testapp: TestApp, item: dict, collection: str
) -> dict:
    """Posts item metadata to resource_path using testapp and return a dict response containing the location"""
    resource_path = get_formatted_resource_path(collection)
    res = testapp.post_json(resource_path, item)
    return testapp.get(res.location).json


def post_item(
    testapp: TestApp,
    post_body: Dict[str, Any],
    collection: str,
    status: Union[int, List[int]] = 201,
) -> Dict[str, Any]:
    """POST content to collection."""
    resource_path = get_formatted_resource_path(collection)
    response = testapp.post_json(resource_path, post_body, status=status)
    if response.status_int == 201:
        return response.json["@graph"][0]
    return response.json


def patch_item(
    testapp: TestApp,
    patch_body: Dict[str, Any],
    identifier: str,
    status: Union[int, List[int]] = 200,
) -> Dict[str, Any]:
    """PATCH content to given item."""
    resource_path = get_formatted_resource_path(identifier)
    response = testapp.patch_json(resource_path, patch_body, status=status)
    if response.status_int == 200:
        return response.json["@graph"][0]
    return response.json


def delete_item(testapp: TestApp, identifier: str, status: int = 200) -> Dict[str, Any]:
    """Delete item with given identifier."""
    set_status_deleted(testapp, identifier)
    resource_path = get_formatted_resource_path(identifier, add_on="purge=True")
    return testapp.delete_json(resource_path, status=status).json


def set_status_deleted(testapp: TestApp, identifier: str) -> Dict[str, Any]:
    """Set status of item with given identifier to deleted."""
    resource_path = get_formatted_resource_path(identifier)
    return patch_item(testapp, {"status": "deleted"}, resource_path)


def get_item(
    testapp: TestApp,
    identifier: str,
    collection: Optional[str] = None,
    frame: Optional[str] = None,
    status: Optional[Union[int, List[int]]] = None,
) -> Dict[str, Any]:
    """Get item view with given frame, following redirects."""
    add_on = get_frame_add_on(frame)
    resource_path = get_formatted_resource_path(
        identifier, collection=collection, add_on=add_on
    )
    response = testapp.get(resource_path, status=status)
    if response.status_int == 301:
        return response.follow().json
    return response.json


def get_search(
    testapp: TestApp,
    query: str,
    status: Union[int, List[int]] = 200,
) -> List[Dict[str, Any]]:
    """Get search results for given query."""
    return testapp.get(query, status=status).json["@graph"]


def format_search_query(query: str) -> str:
    """Format search query for URL expectations."""
    return f"/search/?{query}"


def get_insert_identifier_for_item_type(testapp: TestApp, item_type: str) -> str:
    """Get workbook insert identifier for given item type."""
    search_results = get_inserts_for_item_type(testapp, item_type)
    if not search_results:
        raise RuntimeError(f"No inserts found for {item_type}")
    return search_results[0]["uuid"]


def get_inserts_for_item_type(testapp: TestApp, item_type: str) -> List[Dict[str, Any]]:
    """Get inserts for given item type."""
    search_query = format_search_query(f"type={to_camel_case(item_type)}")
    return get_search(testapp, search_query)


def get_frame_add_on(frame: Union[str, None]) -> str:
    """Format frame parameter, if provided."""
    if frame:
        return f"frame={frame}"
    return ""


def get_formatted_resource_path(
    identifier: str, collection: Optional[str] = None, add_on: Optional[str] = None
) -> str:
    """Format resource path for URL expectations."""
    resource_path_with_add_on = get_resource_path_with_add_on(
        identifier, collection, add_on
    )
    if not resource_path_with_add_on.startswith("/"):
        return f"/{resource_path_with_add_on}"
    return resource_path_with_add_on


def get_resource_path_with_add_on(
    identifier: str, collection: Optional[str] = None, add_on: Optional[str] = None
) -> str:
    """Get resource path with optional URL parameters, if provided."""
    resource_path = get_resource_path(identifier, collection)
    if add_on:
        return f"{resource_path}?{add_on}"
    return resource_path


def get_resource_path(identifier: str, collection: Optional[str] = None) -> str:
    """Get resource path with collection, if provided."""
    if collection:
        return get_formatted_collection_resource_path(identifier, collection)
    return identifier


def get_formatted_collection_resource_path(identifier: str, collection: str) -> str:
    """Format to '{collection}/{identifier}/'.

    Collection can be snake- or camel-cased.
    """
    dashed_collection = get_kebab_formatted_collection(collection)
    return f"/{pluralize_collection(dashed_collection)}/{identifier}/"


def get_kebab_formatted_collection(collection: str) -> str:
    """Format collection to  kebab case.

    Intended for collection to come in camel- or snake-case.
    """
    return to_snake_case(collection).replace("_", "-")


def pluralize_collection(collection: str) -> str:
    """Pluralize item collection name.

    Pluralized names must match those defined by item type definitions.
    """
    name = collection.replace("_", "-")
    # deal with a few special cases explicitly
    specials = [
        "aligned-reads",
        "death-circumstances",
        "sequencing",
        "software",
        "unaligned-reads",
        "variant-calls",
    ]
    if name in specials:
        return name
    if name.endswith("ry") or name.endswith("gy"):
        return name[:-1] + "ies"
    if name.endswith("sis"):
        return name[:-2] + "es"
    if name.endswith("ium"):
        return name[:-2] + "a"
    if name.endswith("s"):
        return name + "es"
    return name + "s"


def assert_keys_conflict(response: Dict[str, Any]) -> None:
    """Ensure response indicates keys conflict error.

    Useful for testing proper unique key in schemas/types.
    """
    assert "HTTPConflict" in response.get("@type", [])
    assert response.get("detail", "").startswith("Keys conflict:")


def get_functional_item_type_names(
    item_with_registry: Union[Registry, TestApp]
) -> List[str]:
    """Get all non-test, non-abstract item type names (snake-cased)."""
    functional_item_types = get_functional_item_types(item_with_registry)
    return functional_item_types.keys()


def get_functional_item_type_info(
    item_with_registry: Union[Registry, TestApp]
) -> List[TypeInfo]:
    """Get TypeInfo classes for non-test, non-abstract item types."""
    functional_item_types = get_functional_item_types(item_with_registry)
    return functional_item_types.values()


def get_functional_item_types(
    item_with_registry: Union[Registry, TestApp]
) -> Dict[str, TypeInfo]:
    """Get all non-test, non-abstract item types."""
    all_item_types = get_all_item_types(item_with_registry)
    return {
        type_name: type_info
        for type_name, type_info in all_item_types.items()
        if not is_test_item(type_name) and not is_abstract_type(type_info)
    }


def get_all_item_types(
    item_with_registry: Union[Registry, TestApp]
) -> Dict[str, TypeInfo]:
    """Get all item types in registry."""
    registry = get_registry(item_with_registry)
    return registry.get(TYPES).by_item_type


def is_test_item(item_name: str) -> bool:
    return item_name.startswith("test")


def is_abstract_type(type_info: AbstractTypeInfo) -> bool:
    return type_info.is_abstract


def get_schemas_with_submitted_id(testapp: TestApp) -> List[Dict[str, Any]]:
    """Get all schemas with submitted_id property."""
    item_types = get_all_item_types(testapp)
    return [
        type_info.schema for type_info in item_types.values()
        if has_submitted_id(type_info)
    ]


def get_items_with_submitted_id(testapp: TestApp) -> List[str]:
    """Get all item types with submitted_id as a property.

    Item names are snake_cased.
    """
    functional_item_types = get_functional_item_types(testapp)
    return [
        item_name for item_name, item_type_info in functional_item_types.items()
        if has_submitted_id(item_type_info)
    ]


def has_submitted_id(type_info: TypeInfo) -> bool:
    return "submitted_id" in schema_utils.get_properties(type_info.schema)


def get_items_without_submitted_id(testapp: TestApp) -> List[str]:
    """Get all item types without submitted_id as a property.

    Item names are snake_cased.
    """
    functional_item_types = get_functional_item_types(testapp)
    return [
        item_name for item_name, item_type_info in functional_item_types.items()
        if not has_submitted_id(item_type_info)
    ]


def get_schema(test_app: TestApp, item_type: str) -> Dict[str, Any]:
    """Get schema for given item type."""
    item_types = get_all_item_types(test_app)
    return item_types[item_type].schema


def has_property(schema: Dict[str, Any], property_name: str) -> bool:
    """Check if schema has given property."""
    return property_name in schema_utils.get_properties(schema)


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


def get_registry(item_with_registry: Union[Registry, TestApp, TypeInfo]) -> Registry:
    """Get registry from given input."""
    if isinstance(item_with_registry, Registry):
        return item_with_registry
    if isinstance(item_with_registry, TestApp):
        return item_with_registry.app.registry
    if isinstance(item_with_registry, TypeInfo):
        return item_with_registry.types.registry
    raise NotImplementedError(
        f"Cannot get registry for {item_with_registry} of type"
        f" {type(item_with_registry)}"
    )


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


def get_workbook_inserts() -> Dict[str, Dict[str, Any]]:
    """Load all workbook inserts."""
    workbook_schemas_path = pkg_resources.resource_filename(
        "encoded", "tests/data/workbook-inserts/"
    )
    workbook_schemas = Path(workbook_schemas_path).glob("*.json")
    return {
        get_item_type(item_insert_file): load_inserts(item_insert_file)
        for item_insert_file in workbook_schemas
    }


def get_item_type(item_insert_file: Path) -> str:
    """Get item type from workbook insert file name."""
    return item_insert_file.name.replace(".json", "")


def load_inserts(insert_file: Path) -> List[Dict[str, Any]]:
    """Load inserts from file."""
    with insert_file.open() as file_handle:
        return json.load(file_handle)
