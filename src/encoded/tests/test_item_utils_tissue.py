from typing import Any, Dict

import pytest

from ..item_utils import constants
from ..item_utils.tissue import (
    BENCHMARKING_TISSUE_REGEX,
    PRODUCTION_TISSUE_REGEX,
    TPC_ALT_TISSUE_REGEX,
    get_donor_kit_id,
    get_project_id,
    get_protocol_id,
    get_study,
    is_tpc_alt,
)


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"external_id": "FooBar"}, ""),
        ({"external_id": "ST001-1A"}, constants.BENCHMARKING_STUDY),
        ({"external_id": "SMHT001-1A"}, constants.PRODUCTION_STUDY),
    ],
)
def test_get_study(properties: Dict[str, Any], expected: str) -> None:
    """Test identification of benchmarking vs. production for tissue."""
    assert get_study(properties) == expected


@pytest.mark.parametrize(
    "string,expected_match",
    [
        ("", False),
        ("AB001-1A", False),
        ("ST01-1A", False),
        ("ST-001-1A", False),
        ("SMHT001-1A", False),
        ("ST001-1A", True),
        ("ST001-1AA", True),
    ],
)
def test_benchmarking_id_regex(string: str, expected_match: bool) -> None:
    """Test benchmarking ID regex."""
    result = BENCHMARKING_TISSUE_REGEX.match(string)
    assert bool(result) == expected_match


@pytest.mark.parametrize(
    "string,expected_match",
    [
        ("", False),
        ("AB001-1A", False),
        ("SMHT01-1A", False),
        ("SMHT-001-1A", False),
        ("ST001-1A", False),
        ("SMHT001-1A", True),
        ("SMHT001-1AA", True),
    ],
)
def test_production_id_regex(string: str, expected_match: bool) -> None:
    """Test production ID regex."""
    result = PRODUCTION_TISSUE_REGEX.match(string)
    assert bool(result) == expected_match


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"external_id": "FooBar"}, ""),
        ({"external_id": "ST001-1A"}, "ST"),
        ({"external_id": "SMHT001-1A"}, "SMHT"),
    ],
)
def test_get_project_id(properties: Dict[str, Any], expected: str) -> None:
    """Test project ID retrieval for annotated filenames."""
    assert get_project_id(properties) == expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"external_id": "FooBar"}, ""),
        ({"external_id": "ST001-1A"}, "001"),
        ({"external_id": "SMHT001-1A"}, "001"),
    ],
)
def test_get_donor_kit_id(properties: Dict[str, Any], expected: str) -> None:
    """Test donor kit ID retrieval for annotated filenames."""
    assert get_donor_kit_id(properties) == expected


@pytest.mark.parametrize(
    "string,expected_match",
    [
        ("", False),
        ("AB001-1A", False),
        ("ST001-1A", False),
        ("SMHT001-1A", False),
        ("SN001-1A", True),
        ("SN001-3A", True),
        ("SN001-3AA", True),
    ],
)
def test_tpc_alt_id_regex(string: str, expected_match: bool) -> None:
    """Test TPC alt ID regex."""
    result = TPC_ALT_TISSUE_REGEX.match(string)
    assert bool(result) == expected_match


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, False),
        ({"external_id": "FooBar"}, False),
        ({"external_id": "ST001-3A"}, False),
        ({"external_id": "SMHT001-3A"}, False),
        ({"external_id": "SN001-3A"}, True),
        ({"external_id": "SN001-3B"}, True),
    ],
)
def test_is_tpc_alt(properties: Dict[str, Any], expected: bool) -> None:
    """Test TPC alt tissue identification."""
    assert is_tpc_alt(properties) == expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"external_id": "FooBar"}, ""),
        ({"external_id": "PS0235"}, ""),
        ({"external_id": "ST001-1A"}, "1A"),
        ({"external_id": "SMHT001-1A"}, "1A"),
        ({"external_id": "SN001-3A"}, "3A"),
        ({"external_id": "SN001-3B"}, "3B"),
        ({"external_id": "CB0-3A"}, "3A"),
        ({"external_id": "CB0-3B"}, "3B"),
        ({"external_id": "ST001-3AC"}, "3AC"),
    ],
)
def test_get_protocol_id(properties: Dict[str, Any], expected: str) -> None:
    """Test protocol ID retrieval for annotated filenames."""
    assert get_protocol_id(properties) == expected
