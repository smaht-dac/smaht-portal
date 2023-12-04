from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def workflow_properties(test_submission_center: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "submission_centers": [test_submission_center["uuid"]],
        "category": ["Testing"],
        "name": "foo_bar",
        "title": "Foo Bar",
    }


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    workflow_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately."""
    post_item(anontestapp, workflow_properties, "Workflow", status=403)
    post_item(unassociated_user_app, workflow_properties, "Workflow", status=422)
    post_item(submission_center_user_app, workflow_properties, "Workflow", status=403)
    post_item(consortium_user_app, workflow_properties, "Workflow", status=422)
    post_item(testapp, workflow_properties, "Workflow", status=201)
