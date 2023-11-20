from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import patch_item, post_item


@pytest.fixture
def workflow(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "category": ["Testing"],
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "name": "a_beauty",
        "title": "A beautiful workflow",
        "version_upgrade_log": "something changed",
        "arguments": [
            {
                "argument_type": "parameter",
                "workflow_argument_name": "foo_bar",
            },
        ],
        "child_file_names": ["foo"],
        "directory_url": "foo/bar",
        "language": "CWL",
        "main_file_name": "foo.bar",
        "tibanna_config": {
            "instance_type": ["c5.4xlarge"],
            "run_name": "foo_bar",
        },
    }
    return post_item(testapp, item, "Workflow")


def test_workflow_post(workflow: Dict[str, Any]) -> None:
    """Ensure Workflow properties POST."""
    pass


@pytest.mark.parametrize(
    "ebs_size,expected_status",
    [
        ("", 422),
        ("twox", 422),
        ("5x", 200),
        ("5.5x", 200),
        ("55.55x", 200),
    ]
)
def test_ebs_size_regex(
    ebs_size: str, expected_status: int, testapp: TestApp, workflow: Dict[str, Any]
) -> None:
    """Test EBS size regex matching properly."""
    tibanna_config = workflow.get("tibanna_config", {})
    updated_tibanna_config = {**tibanna_config, "ebs_size": ebs_size}
    patch_body = {"tibanna_config": updated_tibanna_config}
    patch_item(testapp, patch_body, workflow["uuid"], status=expected_status)


@pytest.mark.parametrize(
    "instance_type,expected_status",
    [
        ("", 422),
        ("c5", 422),
        ("c5large", 422),
        ("5c.large", 422),
        ("c5.large4", 422),
        ("c.large", 422),
        ("c5.large", 200),
        ("c5.xlarge", 200),
        ("c5.4xlarge", 200),
        ("c5.400xlarge", 200),
        ("c54dn.400xlarge-plus", 200),
        ("u-3tb1.56xlarge", 200),
        ("u-9tb1.metal**", 200),
    ]
)
def test_instance_type_regex(
    instance_type: str, expected_status: int, testapp: TestApp, workflow: Dict[str, Any]
) -> None:
    """Test instance type regex matching properly."""
    tibanna_config = workflow.get("tibanna_config", {})
    updated_tibanna_config = {**tibanna_config, "instance_type": [instance_type]}
    patch_body = {"tibanna_config": updated_tibanna_config}
    patch_item(testapp, patch_body, workflow["uuid"], status=expected_status)
