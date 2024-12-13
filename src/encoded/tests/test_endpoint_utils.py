from contextlib import contextmanager
import datetime
from typing import Optional, Union
from unittest.mock import patch as mock_patch
from encoded.endpoint_utils import parse_date_range_related_arguments, parse_datetime_string

DEFAULT_MOCK_DATETIME_TODAY_VALUE = "2024-11-06 07:54:16"


def test_parse_date_range_related_arguments_sans_from_thru_dates():

    def testf(nmonths, include_current_month):
        # Note that include_current_month used ONLY if NEITHER from_date NOR thru_date are specified (this case).
        return parse_date_range_related_arguments(None, None, nmonths=nmonths,
                                                  include_current_month=include_current_month, strings=True)

    with mocked_datetime_today(DEFAULT_MOCK_DATETIME_TODAY_VALUE):
        assert testf(nmonths=3, include_current_month=False) == ("2024-08-01", "2024-10-31")
        assert testf(nmonths=3, include_current_month=False) == ("2024-08-01", "2024-10-31")
        assert testf(nmonths=-3, include_current_month=True) == ("2024-08-01", "2024-11-30")
        assert testf(nmonths=-3, include_current_month=False) == ("2024-08-01", "2024-10-31")
        assert testf(nmonths=1, include_current_month=False) == ("2024-10-01", "2024-10-31")
        assert testf(nmonths=1, include_current_month=True) == ("2024-10-01", "2024-11-30")
        assert testf(nmonths=0, include_current_month=False) == (None, None)
        assert testf(nmonths=0, include_current_month=True) == ("2024-11-01", "2024-11-30")


def test_parse_date_range_related_arguments_with_from_thru_dates():

    def testf(from_date, thru_date):
        # Note that include_current_month used ONLY if NEITHER from_date NOR thru_date are specified.
        return parse_date_range_related_arguments(from_date, thru_date, nmonths=None,
                                                  include_current_month=None, strings=True)

    with mocked_datetime_today(DEFAULT_MOCK_DATETIME_TODAY_VALUE):
        assert testf("2024-05-16", "2024-08-29") == ("2024-05-16", "2024-08-29")
        assert testf("2024-08-29", "2024-05-16") == ("2024-05-16", "2024-08-29")
        assert testf("2024-11-04", "2035-10-06") == ("2024-11-04", "2035-10-06")


def test_parse_date_range_related_arguments_with_from_date():

    def testf(from_date, nmonths):
        # Note that include_current_month used ONLY if NEITHER from_date NOR thru_date are specified.
        return parse_date_range_related_arguments(from_date, None, nmonths=nmonths,
                                                  include_current_month=None, strings=True)

    with mocked_datetime_today(DEFAULT_MOCK_DATETIME_TODAY_VALUE):
        assert testf("2024-06-24", nmonths=None) == ("2024-06-24", None)
        assert testf("2024-06-24", nmonths=0) == ("2024-06-24", "2024-06-30")
        assert testf("2024-06-24", nmonths=1) == ("2024-06-24", "2024-07-24")


def test_parse_date_range_related_arguments_with_thru_date():

    def testf(thru_date, nmonths):
        # Note that include_current_month used ONLY if NEITHER from_date NOR thru_date are specified.
        return parse_date_range_related_arguments(None, thru_date, nmonths=nmonths,
                                                  include_current_month=None, strings=True)

    with mocked_datetime_today(DEFAULT_MOCK_DATETIME_TODAY_VALUE):
        assert testf("2024-06-24", nmonths=None) == (None, "2024-06-24")
        assert testf("2024-06-24", nmonths=0) == ("2024-06-01", "2024-06-24")
        assert testf("2024-06-24", nmonths=-1) == ("2024-05-24", "2024-06-24")


@contextmanager
def mocked_datetime_today(value: Optional[Union[str, datetime.datetime]] = DEFAULT_MOCK_DATETIME_TODAY_VALUE):
    if isinstance(value, str):
        value = parse_datetime_string(value)
    if not isinstance(value, datetime.datetime):
        raise Exception("Error using mocked_datetime_today function!")
    class MockDateTime(datetime.datetime):  # noqa
        @classmethod
        def today(cls):
            nonlocal value ; return value  # noqa
    with (mock_patch("encoded.endpoint_utils.datetime", MockDateTime), mock_patch("datetime.datetime", MockDateTime)):
        yield
