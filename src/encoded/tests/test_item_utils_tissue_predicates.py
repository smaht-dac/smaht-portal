import pytest

from ..item_utils.tissue import (
    get_donor_kit_id_from_external_id,
    is_clinically_accessible,
    is_fibroblast,
    is_germ_cell,
    is_valid_external_id,
)


@pytest.mark.parametrize(
    "external_id,expected",
    [
        # Production (SMHT), Benchmarking (ST), and TPC-alt (SN) all valid
        ("SMHT001-3A", True),
        ("ST001-1A", True),
        ("SN001-1A", True),
        # Two-letter protocol suffix is allowed
        ("SMHT001-3AC", True),
        # Empty / junk
        ("", False),
        ("FooBar", False),
        # Near-miss: only two donor digits
        ("SMHT01-1A", False),
        # Near-miss: unknown prefix
        ("XY001-1A", False),
    ],
)
def test_is_valid_external_id(external_id: str, expected: bool) -> None:
    assert is_valid_external_id(external_id) is expected


@pytest.mark.parametrize(
    "external_id,expected",
    [
        ("SMHT001-3AC", True),  # 3AC is fibroblast
        ("SMHT001-3A", False),
        ("ST001-3U", False),
        ("", False),
    ],
)
def test_is_fibroblast(external_id: str, expected: bool) -> None:
    assert is_fibroblast({"external_id": external_id}) is expected


@pytest.mark.parametrize(
    "code,expected",
    [
        ("3U", True),
        ("3V", True),
        ("3W", True),
        ("3X", True),
        ("3Y", True),
        ("3Z", True),
        ("3AA", True),
        ("3AB", True),
        # Neighbours that must NOT be classified as germ cell
        ("3AC", False),  # fibroblast
        ("3A", False),
        ("3B", False),
    ],
)
def test_is_germ_cell(code: str, expected: bool) -> None:
    assert is_germ_cell({"external_id": f"ST001-{code}"}) is expected


@pytest.mark.parametrize(
    "code,expected",
    [
        ("3A", True),  # blood
        ("3B", True),  # buccal swab
        ("3AC", False),
        ("3U", False),
    ],
)
def test_is_clinically_accessible(code: str, expected: bool) -> None:
    assert is_clinically_accessible({"external_id": f"SMHT001-{code}"}) is expected


def test_tissue_predicates_missing_external_id_are_false() -> None:
    # An item without an external_id must not misclassify as any tissue type.
    assert is_fibroblast({}) is False
    assert is_germ_cell({}) is False
    assert is_clinically_accessible({}) is False


@pytest.mark.parametrize(
    "external_id,expected",
    [
        # Production prefix (SMHT) stripped from the donor segment
        ("SMHT001-3A", "001"),
        # Benchmarking prefix (ST) stripped from the donor segment
        ("ST001-1A", "001"),
        # Non-matching id -> empty
        ("FooBar", ""),
        ("", ""),
    ],
)
def test_get_donor_kit_id_from_external_id(
    external_id: str, expected: str
) -> None:
    assert get_donor_kit_id_from_external_id(external_id) == expected
