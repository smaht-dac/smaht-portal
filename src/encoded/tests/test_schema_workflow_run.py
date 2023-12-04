from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def workflow_run(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
    workflow: Dict[str, Any],
    output_file: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "workflow": workflow["uuid"],
        "run_status": "running",
        "run_url": "https://foo.bar",
        "job_id": "abcde1234",
        "postrun_json": "https://foo/bar.buz",
        "input_files": [
            {
                "workflow_argument_name": "input_1",
                "value": output_file["uuid"],
                "ordinal": 2,
            },
        ],
        "output_files": [
            {
                "workflow_argument_name": "output_1",
                "value": output_file["uuid"],
            },
        ],
        "parameters": [
            {
                "workflow_argument_name": "input_1",
                "value": "some_value",
                "ordinal": 2,
            },
        ],
    }
    post_item(testapp, item, "WorkflowRun")


def test_workflow_run_post(workflow_run: Dict[str, Any]) -> None:
    """Ensure WorkflowRun properties POST."""
    pass
