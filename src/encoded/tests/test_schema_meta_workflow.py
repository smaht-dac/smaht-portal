from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .datafixtures import OUTPUT_FILE_UUID
from .utils import patch_item, post_item


@pytest.fixture
def meta_workflow(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    workflow: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "name": "a_beautiful_workflow",
        "title": "A beauty",
        "category": ["Alignment"],
        "version": "1.0.0",
        "version_upgrade_log": "Some changes were made",
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
        "input": [
            {
                "argument_name": "foo",
                "argument_type": "parameter",
                "value": 15,
            },
        ],
    }
    return post_item(testapp, item, "MetaWorkflow")


@pytest.mark.parametrize(
    "custom_pf_fields,expected_status",
    [
        ({}, 200),
        ({"foo_bar": {"data_category": ["Sequencing Reads"]}}, 200),
        ({"foo_bar": {"data_category": ["Not Valid"]}}, 422),
    ],
)
def test_workflow_custom_pf_fields(
    custom_pf_fields: Dict[str, Dict[str, Any]],
    expected_status: int,
    testapp: TestApp,
    meta_workflow: Dict[str, Any],
) -> None:
    """Ensure 'custom_pf_fields' validating OutputFile properties."""
    existing_workflows = meta_workflow.get("workflows")
    assert existing_workflows
    updated_workflows = [
        {**workflow, "custom_pf_fields": custom_pf_fields}
        for workflow in existing_workflows
    ]
    patch_body = {"workflows": updated_workflows}
    patch_item(testapp, patch_body, meta_workflow["uuid"], status=expected_status)


@pytest.mark.parametrize(
    "input_property,expected_status",
    [
        ({"argument_name": "foo", "argument_type": "parameter"}, 422),
        (
            {"argument_name": "foo", "argument_type": "parameter", "value": 5},
            200,
        ),
        (
            {
                "argument_name": "foo",
                "argument_type": "parameter",
                "value_type": "string",
            },
            200,
        ),
        (
            {"argument_name": "foo", "argument_type": "file", "dimensionality": 1},
            200,
        ),
        (
            {
                "argument_name": "foo",
                "argument_type": "file",
                "files": [{"file": OUTPUT_FILE_UUID, "dimension": "0"}],
            },
            200,
        ),
    ],
)
def test_meta_workflow_input(
    input_property: Dict[str, Any],
    expected_status: int,
    testapp: TestApp,
    meta_workflow: Dict[str, Any],
    output_file: Dict[str, Any],
) -> None:
    """Ensure 'input' validation of anyOf requirements."""
    patch_body = {"input": [input_property]}
    patch_item(testapp, patch_body, meta_workflow["uuid"], status=expected_status)


@pytest.mark.parametrize(
    "input_property,expected_status",
    [
        ({}, 422),
        (
            {"argument_name": "foo", "argument_type": "QC ruleset"},  # Missing 'value'
            422,
        ),
        (
            {
                "argument_name": "foo",
                "argument_type": "QC ruleset",
                "value": 15,  # Wrong type
            },
            422,
        ),
        (
            {
                "argument_name": "foo",
                "argument_type": "QC ruleset",
                "value": {},  # Missing required fields
            },
            422,
        ),
        (  # Invalid 'value_type' per if/then
            {
                "argument_name": "foo",
                "argument_type": "QC ruleset",
                "value": {
                    "overall_quality_status_rule": "foo",
                    "qc_thresholds": [
                        {
                            "id": "bar",
                            "metric": "baz",
                            "operator": ">",
                            "pass_target": 52.7,
                        }
                    ],
                },
                "value_type": "string",
            },
            422,
        ),
        (
            {
                "argument_name": "foo",
                "argument_type": "QC ruleset",
                "value": {
                    "overall_quality_status_rule": "foo",
                    "qc_thresholds": [
                        {
                            "id": "bar",
                            "metric": "baz",
                            "operator": ">",
                            "pass_target": 52.7,
                        }
                    ],
                },
            },
            200,
        ),
    ],
)
def test_input_qc_ruleset(
    input_property: Dict[str, Any],
    expected_status: int,
    testapp: TestApp,
    meta_workflow: Dict[str, Any],
) -> None:
    """Ensure if/then validation of input when QC ruleset provided.

    Note: If/then validation tested more thoroughly in mixins tests;
    this test broadly ensures if/then validation working as expected here.
    """
    patch_body = {"input": [input_property]}
    patch_item(testapp, patch_body, meta_workflow["uuid"], status=expected_status)
