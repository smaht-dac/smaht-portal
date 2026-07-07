from datetime import datetime

import pytest

from ..visualization import convert_date_range, DATE_RANGE_PRESETS


def test_convert_date_range_invalid_preset_raises() -> None:
    with pytest.raises(IndexError):
        convert_date_range("not-a-preset")


def test_convert_date_range_custom_both_dates() -> None:
    result = convert_date_range("custom|2024-01-01|2024-02-15")
    assert result == [datetime(2024, 1, 1), datetime(2024, 2, 15)]


def test_convert_date_range_custom_only_from() -> None:
    result = convert_date_range("custom|2024-01-01")
    assert result == [datetime(2024, 1, 1), None]


def test_convert_date_range_custom_no_dates() -> None:
    assert convert_date_range("custom") == [None, None]


@pytest.mark.parametrize(
    "date_range_str",
    [
        "custom|2024-1-1|2024-02-15",  # from is not exactly 10 chars -> ignored
        "custom||2024-02-15",  # empty from
    ],
)
def test_convert_date_range_custom_malformed_from_is_ignored(
    date_range_str: str,
) -> None:
    # A non-10-char (or empty) date field is silently skipped rather than parsed
    date_from, _ = convert_date_range(date_range_str)
    assert date_from is None


def test_convert_date_range_custom_bad_10_char_date_raises() -> None:
    # Exactly 10 chars but not a real date -> strptime raises ValueError
    with pytest.raises(ValueError):
        convert_date_range("custom|2024-13-99")


@pytest.mark.parametrize("preset", sorted(DATE_RANGE_PRESETS.keys()))
def test_convert_date_range_presets_return_two_datetimes(preset: str) -> None:
    date_from, date_to = convert_date_range(preset)
    assert isinstance(date_from, datetime)
    assert isinstance(date_to, datetime)
    # Ranges are well-formed: start is not after end
    assert date_from <= date_to
