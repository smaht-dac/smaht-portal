from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader


@pytest.mark.parametrize(
    "meta_workflow,expected",
    [
        ({}, {"schema_version": "2"}),
        (
            {
                "schema_version": "1",
                "workflows": [
                    {
                        "foo": "bar",
                    },
                ],
            },
            {
                "schema_version": "2",
                "workflows": [
                    {
                        "foo": "bar",
                    },
                ],
            },
        ),
        (
            {
                "schema_version": "1",
                "workflows": [
                    {
                        "foo": "bar",
                        "custom_pf_fields": {
                            "some_file": {
                                "baz": "qux",
                                "variant_type": ["Single Nucleotide Variant"],
                                "data_category": ["Variant Calls"],
                                "data_type": ["Somatic Variant Calls"],
                            },
                            "another_file": {
                                "data_category": ["Variant Calls"],
                                "data_type": ["Statistics"],
                            },
                        },
                    },
                ],
            },
            {
                "schema_version": "2",
                "workflows": [
                    {
                        "foo": "bar",
                        "custom_pf_fields": {
                            "some_file": {
                                "baz": "qux",
                                "data_category": ["Somatic Variant Calls"],
                                "data_type": ["SNV"],
                            },
                            "another_file": {
                                "data_category": ["Somatic Variant Calls"],
                                "data_type": ["Statistics"],
                            },
                        },
                    },
                ],
            },
        ),
    ]
)
def test_upgrade_meta_workflow_1_2(
    app: Router, meta_workflow: Dict[str, Any], expected: Dict[str, Any]
) -> None:
    """Test MWF upgrader for `custom_pf_fields` from version 1 to 2."""
    upgrader = get_upgrader(app)
    assert upgrader.upgrade(
        "meta_workflow", meta_workflow, current_version="1", target_version="2"
    ) == expected
