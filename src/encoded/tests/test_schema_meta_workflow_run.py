from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def meta_workflow_run_properties(
    test_consortium: Dict[str, Any], meta_workflow: Dict[str, Any]
) -> Dict[str, Any]:
    return {
        "consortia": [test_consortium["uuid"]],
        "meta_workflow": meta_workflow["uuid"],
    }


@pytest.mark.parametrize(
    "properties,expected_status",
    [
        ({}, 201),
        ({"final_status": "running"}, 201),
        ({"failed_jobs": ["abcde"]}, 201),
        ({"cost": 2.34}, 201),
        (
            {
                "input": [
                    {"argument_name": "arg1", "argument_type": "parameter", "value": 6},
                ],
            },
            201,
        ),
    ],
)
def test_references(
    properties: Dict[str, Any],
    expected_status: int,
    testapp: TestApp,
    meta_workflow_run_properties: Dict[str, Any],
) -> None:
    """Test MetaWorkflowRun merge references resolved as expected."""
    to_post = {**meta_workflow_run_properties, **properties}
    post_item(testapp, to_post, "MetaWorkflowRun", status=expected_status)
