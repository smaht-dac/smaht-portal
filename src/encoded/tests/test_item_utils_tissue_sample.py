from typing import Any, Dict

import pytest

from ..item_utils import tissue_sample as tissue_sample_utils


@pytest.mark.parametrize(
    "external_id,expected_match",
    [
        ({"external_id": ""}, False),
        ({"external_id": "AB001-1A-001A1"}, False),
        ({"external_id": "ST01-1A-001A1"}, False),
        ({"external_id": "ST-001-1A-01A4"}, False),
        ({"external_id": "ST001-1A-01A4"}, False),
        ({"external_id": "SMHT001-1A-001S4"}, False),
        ({"external_id": "SMHT001-1A-001A8"}, False),
        ({"external_id": "SMHT001-1A-001A1"}, True),
        ({"external_id": "ST001-1A-001A1"}, True),
        ({"external_id": "ST001-1AA-010B4"}, True),
    ],
)
def test_core_external_id_regex(external_id: Dict[str, Any], expected_match: bool) -> None:
    """Test Core external ID regex."""
    result = tissue_sample_utils.is_core_external_id(external_id)
    assert result == expected_match


@pytest.mark.parametrize(
    "external_id,expected_match",
    [
        ({"external_id": ""}, False),
        ({"external_id": "AB001-1A-001S1"}, False),
        ({"external_id": "ST01-1A-001S1"}, False),
        ({"external_id": "ST-001-1A-01S4"}, False),
        ({"external_id": "ST001-1A-01S4"}, False),
        ({"external_id": "ST001-1A-001A4"}, False),
        ({"external_id": "ST001-1A-001X"}, False),
        ({"external_id": "SMHT001-1A-001S9"}, True),
        ({"external_id": "ST001-1A-001S9"}, True),
        ({"external_id": "ST001-1AA-010W4"}, True),
    ],
)
def test_specimen_external_id_regex(external_id: Dict[str, Any], expected_match: bool) -> None:
    """Test Specimen external ID regex."""
    result = tissue_sample_utils.is_specimen_external_id(external_id)
    assert result == expected_match


@pytest.mark.parametrize(
    "external_id,expected_match",
    [
        ({"external_id": ""}, False),
        ({"external_id": "AB001-1A-001X"}, False),
        ({"external_id": "ST01-1A-001X"}, False),
        ({"external_id": "ST-001-1A-01X"}, False),
        ({"external_id": "ST001-1A-01X"}, False),
        ({"external_id": "ST-001-1A-001S4"}, False),
        ({"external_id": "ST001-1A-001XX"}, False),
        ({"external_id": "SMHT001-1A-001X"}, True),
        ({"external_id": "ST001-1A-001X"}, True),
        ({"external_id": "ST001-1AA-010X"}, True),
    ],
)
def test_homogenate_external_id_regex(external_id: Dict[str, Any], expected_match: bool) -> None:
    """Test Homogenate external ID regex."""
    result = tissue_sample_utils.is_homogenate_external_id(external_id)
    assert result == expected_match


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"external_id": "FooBar"}, ""),
        ({"external_id": "ST001-1A-001X"}, "ST001-1A"),
        ({"external_id": "SMHT001-1A-001B1"}, "SMHT001-1A"),
    ],
)
def test_get_tissue_kit_id(properties: Dict[str, Any], expected: str) -> None:
    """Test tissue kit ID retrieval for annotated filenames."""
    assert tissue_sample_utils.get_tissue_kit_id(properties) == expected