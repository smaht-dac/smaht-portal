import json
import pkg_resources
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from dcicutils.misc_utils import to_snake_case
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


def get_functional_item_type_names(test_app: TestApp) -> List[str]:
    """Get all non-test, non-abstract item type names (snake-cased)."""
    functional_item_types = get_functional_item_types(test_app)
    return functional_item_types.keys()


def get_functional_item_types(test_app: TestApp) -> Dict[str, TypeInfo]:
    """Get all non-test, non-abstract item types."""
    all_item_types = get_all_item_types(test_app)
    return {
        type_name: type_info
        for type_name, type_info in all_item_types.items()
        if not is_test_item(type_name) and not is_abstract_type(type_info)
    }


def get_all_item_types(test_app: TestApp) -> Dict[str, TypeInfo]:
    """Get all item types in test app registry."""
    return test_app.app.registry.get(TYPES).by_item_type


def is_test_item(item_name: str) -> bool:
    return item_name.startswith("test")


def is_abstract_type(type_info: AbstractTypeInfo) -> bool:
    return type_info.is_abstract


def get_schema(test_app: TestApp, item_type: str) -> Dict[str, Any]:
    """Get schema for given item type."""
    item_types = get_all_item_types(test_app)
    return item_types[item_type].schema


def has_property(schema: Dict[str, Any], property_name: str) -> bool:
    """Check if schema has given property."""
    return property_name in schema.get("properties", {})


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


def get_required_properties(test_app: TestApp, item_type: str) -> List[str]:
    """Get required + potentially required properties."""
    schema = get_schema(test_app, item_type)
    required_fields = schema.get("required", [])
    any_of_required_fields = get_any_of_required_fields(schema)
    one_of_required_fields = get_one_of_required_fields(schema)
    return required_fields + any_of_required_fields + one_of_required_fields


def get_any_of_required_fields(schema: Dict[str, Any]) -> List[str]:
    """Get required fields from anyOf properties."""
    any_of_properties = schema.get("anyOf", [])
    return get_conditional_requirements(any_of_properties)


def get_conditional_requirements(
    conditional_options: List[Dict[str, Any]]
) -> List[str]:
    """Get required fields from conditional properties."""
    return [
        required_key
        for entry in conditional_options
        for key, value in entry.items()
        for required_key in value
        if key == "required"
    ]


def get_one_of_required_fields(schema: Dict[str, Any]) -> List[str]:
    """Get required fields from oneOf properties."""
    one_of_properties = schema.get("oneOf", [])
    return get_conditional_requirements(one_of_properties)


def get_identifying_properties(test_app: TestApp, item_type: str) -> List[str]:
    schema = get_schema(test_app, item_type)
    return schema.get("identifyingProperties", [])
