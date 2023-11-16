from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def meta_workflow_properties(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    workflow: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "consortia": [test_consortium["uuid"]],
        "name": "a_beautiful_workflow",
        "title": "A beauty",
        "category": ["Alignment"],
        "version": "1.0.0",
        "workflows": [
            {
                "name": "some_workflow",
                "workflow": workflow["uuid"],
                "input": [
                    {"argument_name": "arg1", "argument_type": "parameter"},
                ],
                "config": {
                    "instance_type": ["c5.4xlarge"],
                    "run_name": "some_workflow",
                },
            },
        ],
    }


@pytest.mark.parametrize(
    "properties,expected_status",
    [
        ({}, 201),
        (
            {
                "input": [
                    {
                        "argument_name": "foobar",
                        "argument_type": "parameter",
                        "value": 5,
                    }
                ]
            },
            201,
        ),
    ],
)
def test_references(
    properties: Dict[str, Any],
    expected_status: int,
    testapp: TestApp,
    meta_workflow_properties: Dict[str, Any],
) -> None:
    """Test MetaWorkflow references resolved as expected."""
    item = {**meta_workflow_properties, **properties}
    post_item(testapp, item, "MetaWorkflow", status=expected_status)
