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


def test_get_fixed_to_fresh_protocols_maps_1j_and_1k_to_1l() -> None:
    """Both benchmarking skin protocols (1J specimen, 1K core) map to the same
    fixed protocol 1L. A naive {v: k for k, v in ...} reverse map silently
    drops one of them; get_fixed_to_fresh_protocols() must keep both, or a
    donor with only a 1J (or only a 1K) fresh group would incorrectly be
    reported as missing a fresh counterpart for its 1L fixed samples.
    """
    reverse_map = tissue_sample_utils.get_fixed_to_fresh_protocols()
    assert reverse_map["1L"] == {"1J", "1K"}


@pytest.mark.parametrize(
    "fixed_protocol,expected_fresh_protocols",
    [
        ("3J", {"3I"}),
        ("3D", {"3C"}),
        ("1L", {"1J", "1K"}),
        ("3AP", {"3AK"}),
        ("3AS", {"3AN"}),
        ("3AT", {"3AO"}),
    ],
)
def test_get_fixed_to_fresh_protocols_pairings(
    fixed_protocol: str, expected_fresh_protocols: Dict[str, Any]
) -> None:
    """Spot-check a handful of protocol pairings, including brain hemisphere
    codes (3AS/3AT), which must stay distinct rather than collapsing left and
    right hippocampus together."""
    reverse_map = tissue_sample_utils.get_fixed_to_fresh_protocols()
    assert reverse_map[fixed_protocol] == expected_fresh_protocols
