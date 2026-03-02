import json
import pkg_resources
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from dcicutils import schema_utils
from dcicutils.misc_utils import exported, to_camel_case, to_snake_case
from jsonschema import validate, ValidationError
from pyramid.registry import Registry
from pyramid.router import Router
from snovault import Collection, COLLECTIONS, TYPES, load_schema as snovault_load_schema
from snovault.typeinfo import AbstractTypeInfo, TypeInfo
from snovault.upgrader import UPGRADER, Upgrader
from webtest.app import TestApp

from ..utils import (
    get_formatted_resource_path,
    get_item_with_testapp as get_item,
    pluralize_collection,
)
from ..types.submitted_item import SubmittedItem
from ..types.submitted_file import SubmittedFile


def post_item_and_return_location(
    testapp: TestApp, item: dict, collection: str
) -> dict:
    """Posts item metadata to resource path using testapp.

    Return a dict response containing the location.
    """
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


def get_search(
    testapp: TestApp,
    query: str,
    status: Union[int, List[int]] = [200, 301],
) -> List[Dict[str, Any]]:
    """Get search results for given query."""
    formatted_query = format_search_query(query)
    response = testapp.get(formatted_query, status=status)
    if response.status_int == 301:
        return response.follow().json["@graph"]
    if response.status_int == 200:
        return response.json["@graph"]
    return response.json


def format_search_query(query: str) -> str:
    """Format search query for URL expectations."""
    if query.startswith("/search"):
        return query
    if not query.startswith("/") and query.startswith("search"):
        return f"/{query}"
    if not query.startswith("?"):
        return f"/search/?{query}"
    return f"/search/{query}"


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


def assert_keys_conflict(response: Dict[str, Any]) -> None:
    """Ensure response indicates keys conflict error.

    Useful for testing proper unique key in schemas/types.
    """
    assert "HTTPConflict" in response.get("@type", [])
    assert response.get("detail", "").startswith("Keys conflict:")


def assert_validation_error_as_expected(
    response: Dict[str, Any],
    is_unique: bool = True,
    location: str = '',
    name_start: str = '',
    is_exact: bool = False
) -> None:
    """Ensure response indicates validation error of given type.
    Useful for testing proper schema validation.
    """
    assert "ValidationFailure" in response.get("@type", [])
    errors = response.get("errors", [])
    if is_unique and len(errors) != 1:
        raise AssertionError(
            f"Expected exactly one validation error, found {len(errors)}."
        )
    for error in errors:
        if location and error.get("location") == location:
            if name_start:  # want to check name
                err_name = error.get("name", "")
                if is_exact and error.get("name") == name_start:
                    return True
                elif err_name.startswith(name_start):
                    return True
                else:
                    continue
            else:  # location is enough
                return True
    raise AssertionError(
        f"Expected validation error not found in errors: {errors}"
    )


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


def get_submitted_item_types(test_app: TestApp) -> Dict[str, TypeInfo]:
    """Get all submitted item types."""
    all_item_types = get_all_item_types(test_app)
    return {
        type_name: type_info
        for type_name, type_info in all_item_types.items()
        if is_submitted_item(type_info)
    }


def is_submitted_item(type_info: AbstractTypeInfo) -> bool:
    """Is type child of SubmittedItem?"""
    return issubclass(type_info.factory, SubmittedItem) or issubclass(
        type_info.factory, SubmittedFile
    )


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
        type_info.schema
        for type_info in item_types.values()
        if has_submitted_id(type_info)
    ]


def get_items_with_submitted_id(testapp: TestApp) -> List[str]:
    """Get all item types with submitted_id as a property.

    Item names are snake_cased.
    """
    functional_item_types = get_functional_item_types(testapp)
    return [
        item_name
        for item_name, item_type_info in functional_item_types.items()
        if has_submitted_id(item_type_info)
    ]


def has_submitted_id(type_info: TypeInfo) -> bool:
    return has_property(type_info.schema, "submitted_id")


def get_items_without_submitted_id(testapp: TestApp) -> List[str]:
    """Get all item types without submitted_id as a property.

    Item names are snake_cased.
    """
    functional_item_types = get_functional_item_types(testapp)
    return [
        item_name
        for item_name, item_type_info in functional_item_types.items()
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


def get_workbook_inserts_for_collection(collection: str) -> List[Dict[str, Any]]:
    """Get workbook inserts for given collection."""
    workbook_inserts = get_workbook_inserts()
    return workbook_inserts.get(collection, [])


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


def get_upgrader(app: Router) -> Upgrader:
    """Get upgrader from app."""
    return app.registry[UPGRADER]


def get_item_properties_from_workbook_inserts(
    submission_center: Dict[str, Any]
) -> Dict[str, Dict[str, Any]]:
    """Get representative item types from workbook inserts.

    For those with submission centers and consortia, wipe and replace
    with only provided submission center.
    """
    inserts = get_workbook_inserts()
    return clean_workbook_inserts(inserts, submission_center)


def clean_workbook_inserts(
    workbook_inserts: Dict[str, Dict[str, Any]], submission_center: Dict[str, Any]
) -> Dict[str, Dict[str, Any]]:
    """Clean workbook inserts to only include submission center.

    For those with submission centers and consortia, wipe and replace
    with only provided submission center.
    """
    return {
        item_type: replace_inserts_affiliations(item_inserts, submission_center)
        for item_type, item_inserts in workbook_inserts.items()
    }


def replace_inserts_affiliations(
    item_inserts: List[Dict[str, Any]], submission_center: Dict[str, Any]
) -> Dict[str, Any]:
    """Replace affiliations in item inserts with provided submission center."""
    return [
        replace_insert_affiliations(item_insert, submission_center)
        for item_insert in item_inserts
    ]


def replace_insert_affiliations(
    item_insert: Dict[str, Any], submission_center: Dict[str, Any]
) -> Dict[str, Any]:
    """If needed, replace affiliations in item insert with provided
    submission center.
    """
    if has_affiliations(item_insert):
        return replace_affiliations(item_insert, submission_center)
    return item_insert


def has_affiliations(item_insert: Dict[str, Any]) -> bool:
    """Check if item insert has submission centers or consortia."""
    return any(
        [
            item_insert.get("submission_centers", []),
            item_insert.get("consortia", []),
        ]
    )


def replace_affiliations(
    item_insert: Dict[str, Any], submission_center: Dict[str, Any]
) -> Dict[str, Any]:
    """Replace affiliations in item insert with provided submission center.

    Assumes submission_centers property is valid. Can check schemas if
    assumption no longer holds.
    """
    insert_without_affiliation = {
        key: value
        for key, value in item_insert.items()
        if key not in ["submission_centers", "consortia"]
    }
    
    test_insert = {
        **insert_without_affiliation,
        "submission_centers": [submission_center["uuid"]],
    }
    if 'submitted_id' in item_insert:
        test_insert['submitted_id'] = replace_submitted_id(item_insert.get("submitted_id",""), submission_center)
    return test_insert


def replace_submitted_id(
    submitted_id: str, submission_center: Dict[str, Any]
) -> str:
    """Replace affiliation portion of submitted_id to display test submission center code."""
    return f"{submission_center.get('code','').upper()}_{('_').join(submitted_id.split('_')[1:])}"


def post_identifying_insert(
    test_app: TestApp,
    insert: Dict[str, Any],
    collection: str,
    status: Optional[Union[int, List[int]]] = 201,
) -> Dict[str, Any]:
    """Get insert with limited properties and POST it."""
    to_post = get_identifying_insert(test_app, insert, collection)
    return post_item(test_app, to_post, collection=collection, status=status)


def get_identifying_insert(
    test_app: TestApp, insert: Dict[str, Any], item_type: str
) -> Dict[str, Any]:
    """Get insert with required + identifying properties for POST attempt.

    Keep submission centers, if present.
    """
    properties_to_keep = [
        "submission_centers",
        *get_identifying_properties(test_app, item_type),
        *get_required_properties(test_app, item_type),
    ]
    return {key: value for key, value in insert.items() if key in properties_to_keep}


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


def delete_field(
    test_app: TestApp,
    identifier: str,
    to_delete: str,
    patch_body: Optional[Dict[str, Any]] = None,
    status: Union[int, List[int]] = 200,
) -> Dict[str, Any]:
    """Delete field from item with given identifier."""
    resource_path = get_formatted_resource_path(
        identifier, add_on=f"delete_fields={to_delete}"
    )
    return patch_item(test_app, patch_body or {}, resource_path, status=status)


def get_items_from_search(test_app: TestApp, collection: str, add_on: str = "") -> Dict[str, Any]:
    """Get workbook items for given collection via search
        useful for debugging workbook tests."""
    search_results = get_search(test_app, f"type={to_camel_case(collection)}{add_on}")
    assert search_results, f"No {collection} found in search results"
    return search_results


def get_item_from_search(test_app: TestApp, collection: str, add_on: str = "") -> Dict[str, Any]:
    """Get workbook item for given collection via search."""
    search_results = get_search(test_app, f"type={to_camel_case(collection)}{add_on}")
    assert search_results, f"No {collection} found in search results"
    return search_results[0]


def load_schema(item_type: str) -> Dict[str, Any]:
    """Load schema for given item type."""
    return snovault_load_schema(
        f"encoded:schemas/{to_snake_case(item_type)}.json"
    )


def validate_schema(schema: Dict[str, Any], to_validate: Any) -> str:
    """Validate value against schema."""
    try:
        validate(instance=to_validate, schema=schema)
    except ValidationError as e:
        return str(e)
    else:
        return ""


def fix_sample_submitted_ids_for_tests(
    insert: Dict[str, Any]
) -> Dict[str, Any]:
    """Fix sample submitted_ids in insert for tests."""
    keyname = next((k for k in ("tissue_samples", "samples") if k in insert), None)
    if keyname:
        fixed_samples = []
        for sample in insert[keyname]:
            if sample.startswith("NDRITEST_"):
                fixed_samples.append(sample.replace("NDRITEST_", "TEST_"))
            else:
                fixed_samples.append(sample)
        insert[keyname] = fixed_samples
    return insert


exported(get_item)
exported(pluralize_collection)
