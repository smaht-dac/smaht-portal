from typing import Any, Dict, Optional, Union

from webtest.app import TestApp


def post_item_and_return_location(testapp: TestApp, item: dict, collection: str) -> dict:
    """ Posts item metadata to resource_path using testapp and return a dict response containing the location """
    resource_path = get_formatted_resource_path(collection)
    res = testapp.post_json(resource_path, item)
    return testapp.get(res.location).json


def post_item(
    testapp: TestApp, post_body: Dict[str, Any], collection: str, status: int = 201
) -> Dict[str, Any]:
    resource_path = get_formatted_resource_path(collection)
    response = testapp.post_json(resource_path, post_body, status=status)
    if status == 201:
        return response.json["@graph"][0]
    return response.json


def patch_item(
    testapp: TestApp, patch_body: Dict[str, Any], identifier: str, status: int = 200
) -> Dict[str, Any]:
    resource_path = get_formatted_resource_path(identifier)
    response = testapp.patch_json(resource_path, patch_body, status=status)
    if status == 200:
        return response.json["@graph"][0]
    return response.json


def get_item(
    testapp: TestApp, identifier: str, frame: Optional[str] = None
) -> Dict[str, Any]:
    resource_path = get_formatted_resource_path(identifier, add_on=f"frame={frame}")
    response = testapp.get(resource_path)
    if response.status == 301:
        return response.follow().json
    return response.json


def get_formatted_resource_path(resource_path: str, add_on: Optional[str] = None) -> str:
    resource_path_with_add_on = get_resource_path_with_add_on(resource_path, add_on)
    if not resource_path_with_add_on.startswith("/"):
        return f"/{resource_path_with_add_on}"
    return resource_path_with_add_on


def get_resource_path_with_add_on(resource_path: str, add_on: Union[str, None]) -> str:
    if add_on:
        return f"{resource_path}?{add_on}"
    return resource_path
