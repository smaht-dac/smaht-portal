from typing import Any, Dict, List

import pytest

from ..item_utils.file import (
    are_reads_phased,
    are_reads_sorted,
    get_alignment_details,
    get_analysis_details,
    get_data_category,
    get_data_type,
    has_copy_number_variants,
    has_indel_variants,
    has_mobile_element_insertions,
    has_single_nucleotide_variants,
    has_structural_variants,
    is_aligned_reads,
    is_file,
    is_filtered,
    is_germline,
    is_unaligned_reads,
    is_variant_calls,
)


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, False),
        ({"@type": []}, False),
        ({"@type": ["OutputFile", "File", "Item"]}, True),
        ({"@type": ["Sample", "Item"]}, False),
    ],
)
def test_is_file(properties: Dict[str, Any], expected: bool) -> None:
    assert is_file(properties) is expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, False),
        ({"data_type": ["Unaligned Reads"]}, True),
        ({"data_type": ["Aligned Reads"]}, False),
        ({"data_type": ["Unaligned Reads", "Aligned Reads"]}, True),
    ],
)
def test_is_unaligned_reads(properties: Dict[str, Any], expected: bool) -> None:
    assert is_unaligned_reads(properties) is expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, False),
        ({"data_type": ["Aligned Reads"]}, True),
        ({"data_type": ["Unaligned Reads"]}, False),
    ],
)
def test_is_aligned_reads(properties: Dict[str, Any], expected: bool) -> None:
    assert is_aligned_reads(properties) is expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, False),
        ({"data_category": ["Germline Variant Calls"]}, True),
        ({"data_category": ["Somatic Variant Calls"]}, True),
        ({"data_category": ["Sequencing Reads"]}, False),
        (
            {"data_category": ["Germline Variant Calls", "Somatic Variant Calls"]},
            True,
        ),
    ],
)
def test_is_variant_calls(properties: Dict[str, Any], expected: bool) -> None:
    assert is_variant_calls(properties) is expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, False),
        ({"data_category": ["Germline Variant Calls"]}, True),
        # Somatic is a variant call but not germline
        ({"data_category": ["Somatic Variant Calls"]}, False),
    ],
)
def test_is_germline(properties: Dict[str, Any], expected: bool) -> None:
    assert is_germline(properties) is expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, []),
        ({"alignment_details": ["Sorted"]}, ["Sorted"]),
    ],
)
def test_get_alignment_details(
    properties: Dict[str, Any], expected: List[str]
) -> None:
    assert get_alignment_details(properties) == expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, []),
        ({"analysis_details": ["Filtered"]}, ["Filtered"]),
    ],
)
def test_get_analysis_details(
    properties: Dict[str, Any], expected: List[str]
) -> None:
    assert get_analysis_details(properties) == expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, False),
        ({"alignment_details": ["Sorted"]}, True),
        ({"alignment_details": ["Phased"]}, False),
    ],
)
def test_are_reads_sorted(properties: Dict[str, Any], expected: bool) -> None:
    assert are_reads_sorted(properties) is expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, False),
        # "Phased" is checked in both alignment_details and analysis_details
        ({"alignment_details": ["Phased"]}, True),
        ({"analysis_details": ["Phased"]}, True),
        ({"alignment_details": ["Sorted"]}, False),
    ],
)
def test_are_reads_phased(properties: Dict[str, Any], expected: bool) -> None:
    assert are_reads_phased(properties) is expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, False),
        ({"analysis_details": ["Filtered"]}, True),
        # "Filtered" is only checked in analysis_details, not alignment_details
        ({"alignment_details": ["Filtered"]}, False),
    ],
)
def test_is_filtered(properties: Dict[str, Any], expected: bool) -> None:
    assert is_filtered(properties) is expected


@pytest.mark.parametrize(
    "predicate,token",
    [
        (has_single_nucleotide_variants, "SNV"),
        (has_indel_variants, "Indel"),
        (has_copy_number_variants, "CNV"),
        (has_structural_variants, "SV"),
        (has_mobile_element_insertions, "MEI"),
    ],
)
def test_variant_type_predicates(predicate, token: str) -> None:
    assert predicate({}) is False
    assert predicate({"data_type": [token]}) is True
    assert predicate({"data_type": ["something-else"]}) is False


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, []),
        ({"data_category": ["Sequencing Reads"]}, ["Sequencing Reads"]),
    ],
)
def test_get_data_category(
    properties: Dict[str, Any], expected: List[str]
) -> None:
    assert get_data_category(properties) == expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, []),
        ({"data_type": ["Aligned Reads"]}, ["Aligned Reads"]),
    ],
)
def test_get_data_type(properties: Dict[str, Any], expected: List[str]) -> None:
    assert get_data_type(properties) == expected
