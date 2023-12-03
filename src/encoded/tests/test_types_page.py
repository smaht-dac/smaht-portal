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


@pytest.fixture
def page_properties(test_submission_center: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "identifier": "foo_bar_page",
        "submission_centers": [test_submission_center["uuid"]],
    }


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


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    page_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately.

    Note: 422 (Unprocessable) instead of 403 (Forbidden) because of
    'identifier' permissions and requirement.
    """
    post_item(anontestapp, page_properties, "Page", status=422)
    post_item(unassociated_user_app, page_properties, "Page", status=422)
    post_item(submission_center_user_app, page_properties, "Page", status=422)
    post_item(consortium_user_app, page_properties, "Page", status=422)
    post_item(testapp, page_properties, "Page", status=201)
