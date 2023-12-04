from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def meta_workflow_run(
    testapp: TestApp, test_consortium: Dict[str, Any], meta_workflow: Dict[str, Any]
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "meta_workflow": meta_workflow["uuid"],
        "final_status": "running",
        "failed_jobs": ["abcde"],
        "cost": 3.45,
        "input": [{"argument_name": "arg1", "argument_type": "parameter", "value": 6}],
    }
    return post_item(testapp, item, "MetaWorkflowRun")


def test_meta_workflow_run_post(meta_workflow_run: Dict[str, Any]) -> None:
    """Ensure MetaWorkflowRun properties POST."""
    pass
