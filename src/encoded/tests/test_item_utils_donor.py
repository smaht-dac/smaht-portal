import pytest
import re

from ..item_utils.donor import BENCHMARKING_DONOR_REGEX, PRODUCTION_DONOR_REGEX


@pytest.mark.parametrize(
    "string, expected_match",
    [
        ("", False),
        ("AB001", False),
        ("ST01", False),
        ("ST-001", False),
        ("SMHT001", False),
        ("ST001", True),
    ],
)
def test_benchmarking_id_regex(string: str, expected_match: bool) -> None:
    """Test benchmarking ID regex."""
    result = BENCHMARKING_DONOR_REGEX.match(string)
    assert bool(result) == expected_match


@pytest.mark.parametrize(
    "string, expected_match",
    [
        ("", False),
        ("AB001", False),
        ("SMHT01", False),
        ("SMHT-001", False),
        ("ST001", False),
        ("SMHT001", True),
    ],
)
def test_production_id_regex(string: str, expected_match: bool) -> None:
    """Test production ID regex."""
    result = PRODUCTION_DONOR_REGEX.match(string)
    assert bool(result) == expected_match
