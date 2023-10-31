from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item_and_return_location


@pytest.fixture
def workflow_properties(
    testapp: TestApp, test_consortium: Dict[str, Any]
) -> Dict[str, Any]:
    return {
        "category": ["Testing"],
        "consortia": [test_consortium["uuid"]],
        "title": "A beautiful workflow",
    }


@pytest.mark.parametrize(
    "properties",
    [
        {},
        {
            "arguments": [
                {
                    "argument_type": "Input file",
                    "workflow_argument_name": "A beautiful input file",
                },
            ],
        },
    ],
)
def test_workflow_properties(
    properties: Dict[str, Any], testapp: TestApp, workflow_properties: Dict[str, Any]
) -> None:
    workflow_properties.update(properties)
    post_item_and_return_location(testapp, workflow_properties, "Workflow")
