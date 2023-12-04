from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def meta_workflow_properties(
    workflow: Dict[str, Any], test_submission_center: Dict[str, Any]
) -> Dict[str, Any]:
    return {
        "submission_centers": [test_submission_center["uuid"]],
        "category": ["Alignment"],
        "name": "foo_bar",
        "title": "Foo Bar",
        "version": "1.1.1",
        "workflows": [
            {
                "name": "workflow_1",
                "workflow": workflow["uuid"],
                "config": {"run_name": "foobar", "instance_type": ["c5n.4xlarge"]},
                "input": [{"argument_name": "foo", "argument_type": "parameter"}],
            },
        ],
    }


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    meta_workflow_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately."""
    post_item(anontestapp, meta_workflow_properties, "MetaWorkflow", status=403)
    post_item(
        unassociated_user_app, meta_workflow_properties, "MetaWorkflow", status=422
    )
    post_item(
        submission_center_user_app, meta_workflow_properties, "MetaWorkflow", status=403
    )
    post_item(consortium_user_app, meta_workflow_properties, "MetaWorkflow", status=422)
    post_item(testapp, meta_workflow_properties, "MetaWorkflow", status=201)
