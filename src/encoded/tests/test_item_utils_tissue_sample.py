from typing import Any, Dict

import pytest

from ..item_utils import tissue_sample as tissue_sample_utils


@pytest.mark.parametrize(
    "external_id,expected_match",
    [
        ("", False),
        ("AB001-1A-001A1", False),
        ("ST01-1A-001A1", False),
        ("ST-001-1A-01A4", False),
        ("ST001-1A-01A4", False),
        ("SMHT001-1A-001S4", False),
        ("SMHT001-1A-001A8", False),
        ("SMHT001-1A-001A1", True),
        ("ST001-1A-001A1", True),
        ("ST001-1AA-010B4", True),
    ],
)
def test_core_external_id_regex(external_id: Dict[str, Any], expected_match: bool) -> None:
    """Test Core external ID regex."""
    result = tissue_sample_utils.is_core_external_id(external_id)
    assert result == expected_match


@pytest.mark.parametrize(
    "external_id,expected_match",
    [
        ("", False),
        ("AB001-1A-001S1", False),
        ("ST01-1A-001S1", False),
        ("ST-001-1A-01S4", False),
        ("ST001-1A-01S4", False),
        ("ST001-1A-001A4", False),
        ("ST001-1A-001X", False),
        ("SMHT001-1A-001S9", True),
        ("ST001-1A-001S9", True),
        ("ST001-1AA-010W4", True),
    ],
)
def test_specimen_external_id_regex(external_id: Dict[str, Any], expected_match: bool) -> None:
    """Test Specimen external ID regex."""
    result = tissue_sample_utils.is_specimen_external_id(external_id)
    assert result == expected_match


@pytest.mark.parametrize(
    "external_id,expected_match",
    [
        ("", False),
        ("AB001-1A-001X", False),
        ("ST01-1A-001X", False),
        ("ST-001-1A-01X", False),
        ("ST001-1A-01X", False),
        ("ST-001-1A-001S4", False),
        ("ST001-1A-001XX", False),
        ("SMHT001-1A-001X", True),
        ("ST001-1A-001X", True),
        ("ST001-1AA-010X", True),
    ],
)
def test_homogenate_external_id_regex(external_id: Dict[str, Any], expected_match: bool) -> None:
    """Test Homogenate external ID regex."""
    result = tissue_sample_utils.is_homogenate_external_id(external_id)
    assert result == expected_match