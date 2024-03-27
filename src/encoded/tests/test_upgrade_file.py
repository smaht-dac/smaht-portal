import copy
from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader


@pytest.mark.parametrize(
    "file,expected",
    [
        (
            {
                "data_category": ["Germline Variant Calls"],
                "data_type": ["SNV", "Indel"],
                "schema_version": "1",
            },
            {
                "data_category": ["Germline Variant Calls"],
                "data_type": ["SNV", "Indel"],
                "schema_version": "2",
            },
        ),
        (
            {
                "data_category": ["Sequencing Reads"],
                "data_type": ["Aligned Reads"],
                "schema_version": "1",
            },
            {
                "data_category": ["Sequencing Reads"],
                "data_type": ["Aligned Reads"],
                "schema_version": "2",
            },
        ),
        (
            {
                "data_category": ["Germline Variant Calls"],
                "data_type": ["SNV", "Indel"],
                "variant_type": [
                    "Single Nucleotide Variant",
                    "Insertion-deletion",
                    "Copy Number Variant",
                    "Structural Variant",
                    "Mobile Element Insertion"
                ],
                "schema_version": "1",
            },
            {
                "data_category": ["Germline Variant Calls"],
                "data_type": ["SNV", "Indel", "CNV", "SV", "MEI"],
                "schema_version": "2",
            },
        ),
        (
            {
                "data_category": ["Germline Variant Calls"],
                "data_type": [
                    "Single Nucleotide Variant",
                    "Insertion-deletion",
                    "Copy Number Variant",
                    "Structural Variant",
                    "Mobile Element Insertion"
                ],
                "schema_version": "1",
            },
            {
                "data_category": ["Germline Variant Calls"],
                "data_type": ["SNV", "Indel", "CNV", "SV", "MEI"],
                "schema_version": "2",
            },
        ),
        (
            {
                "data_category": ["Variant Calls"],
                "data_type": ["Germline Variants"],
                "variant_type": ["Single Nucleotide Variant", "Insertion-deletion"],
                "schema_version": "1",
            },
            {
                "data_category": ["Germline Variant Calls"],
                "data_type": ["SNV", "Indel"],
                "schema_version": "2",
            },
        ),
        (
            {
                "data_category": ["Variant Calls"],
                "data_type": ["Somatic Variants"],
                "variant_type": ["Single Nucleotide Variant", "Insertion-deletion"],
                "schema_version": "1",
            },
            {
                "data_category": ["Somatic Variant Calls"],
                "data_type": ["SNV", "Indel"],
                "schema_version": "2",
            },
        ),
        (
            {
                "data_category": ["Variant Calls"],
                "data_type": ["Somatic Variant Calls"],
                "variant_type": ["Single Nucleotide Variant", "Insertion-deletion"],
                "schema_version": "1",
            },
            {
                "data_category": ["Somatic Variant Calls"],
                "data_type": ["SNV", "Indel"],
                "schema_version": "2",
            },
        ),
    ]
)
def test_upgrade_variant_info_1_2(
    app: Router, file: Dict[str, Any], expected: Dict[str, Any]
) -> None:
    """Test file upgrader for variant info from version 1 to 2."""
    upgrader = get_upgrader(app)
    variant_calls = copy.deepcopy(file)
    output_file = copy.deepcopy(file)
    reference_file = copy.deepcopy(file)
    assert upgrader.upgrade(
        "variant_calls", variant_calls, current_version="1", target_version="2"
    ) == expected
    assert upgrader.upgrade(
        "output_file", output_file, current_version="1", target_version="2"
    ) == expected
    assert upgrader.upgrade(
        "reference_file", reference_file, current_version="1", target_version="2"
    ) == expected
