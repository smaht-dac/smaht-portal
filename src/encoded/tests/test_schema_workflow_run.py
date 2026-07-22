from typing import Any, Dict

from webtest.app import TestApp

from .utils import post_item


def test_workflow_run_revision_history_not_tracked(
    testapp: TestApp, workflow: Dict[str, Any], test_consortium: Dict[str, Any]
) -> None:
    """WorkflowRun opts out of Postgres revision-history tracking."""
    workflow_run = post_item(
        testapp,
        {
            "workflow": workflow["uuid"],
            "consortia": [test_consortium["uuid"]],
        },
        "WorkflowRun",
    )
    testapp.get(f'/{workflow_run["uuid"]}/@@revision-history', status=404)
