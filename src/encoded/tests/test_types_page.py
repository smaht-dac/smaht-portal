from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import get_item, post_item


@pytest.fixture
def page(testapp: TestApp, test_consortium: Dict[str, Any]) -> Dict[str, Any]:
    item = {
        "identifier": "some-page",
        "consortia": [test_consortium["uuid"]],
        "status": "public",
    }
    return post_item(testapp, item, "Page")


def test_identifier_resource_path_in_collection(
    testapp: TestApp, page: Dict[str, Any]
):
    """Ensure 'identifier' is available resource path within collection."""
    identifier = page.get("identifier", "")
    get_item(testapp, identifier, collection="Page")


@pytest.mark.workbook
def test_identifier_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'identifier' is available resource path without collection.

    Note: Must match a Page 'identifier' in workbook-inserts.
    """
    get_item(es_testapp, "about")
