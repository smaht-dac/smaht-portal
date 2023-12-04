from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def meta_workflow_run_properties(
    meta_workflow: Dict[str, Any], test_submission_center: Dict[str, Any]
) -> Dict[str, Any]:
    return {
        "submission_centers": [test_submission_center["uuid"]],
        "meta_workflow": meta_workflow["uuid"],
    }


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    meta_workflow_run_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately."""
    post_item(anontestapp, meta_workflow_run_properties, "MetaWorkflowRun", status=403)
    post_item(
        unassociated_user_app,
        meta_workflow_run_properties,
        "MetaWorkflowRun",
        status=422,
    )
    post_item(
        submission_center_user_app,
        meta_workflow_run_properties,
        "MetaWorkflowRun",
        status=403,
    )
    post_item(
        consortium_user_app, meta_workflow_run_properties, "MetaWorkflowRun", status=422
    )
    post_item(testapp, meta_workflow_run_properties, "MetaWorkflowRun", status=201)
