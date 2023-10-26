from typing import Any, Dict

from webtest.app import TestApp


def post_item_and_return_location(testapp: TestApp, item: dict, resource_path: str) -> dict:
    """ Posts item metadata to resource_path using testapp and return a dict response containing the location """
    res = testapp.post_json(f'/{resource_path}', item)
    return testapp.get(res.location).json


def patch_item(
    testapp: TestApp, patch_body: Dict[str, Any], resource_path: str, status: int = 200
) -> Dict[str, Any]:
    response = testapp.patch_json(f"/{resource_path}", patch_body, status=status)
    if status == 200:
        return response.json["@graph"][0]
    return response.json
