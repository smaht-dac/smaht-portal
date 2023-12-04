from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import get_item, post_item


@pytest.fixture
def consortium_properties() -> Dict[str, Any]:
    return {
        "title": "Some consortium",
        "identifier": "foo_bar_consortium",
    }

def test_identifier_resource_path(
    testapp: TestApp, test_consortium: Dict[str, Any]
):
    """Ensure 'identifier' is available resource path."""
    identifier = test_consortium.get("identifier", "")
    get_item(testapp, identifier, collection="Consortium")


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    consortium_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately.

    Note: 422 (Unprocessable) instead of 403 (Forbidden) because of
    'identifier' permissions and requirement.
    """
    post_item(anontestapp, consortium_properties, "Consortium", status=422)
    post_item(unassociated_user_app, consortium_properties, "Consortium", status=422)
    post_item(submission_center_user_app, consortium_properties, "Consortium", status=422)
    post_item(consortium_user_app, consortium_properties, "Consortium", status=422)
    post_item(testapp, consortium_properties, "Consortium", status=201)
