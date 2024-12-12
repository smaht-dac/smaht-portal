import calendar
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
import pyramid
from typing import Any, List, Optional, Tuple, Union
from urllib.parse import urlencode
from dcicutils.datetime_utils import parse_datetime_string as dcicutils_parse_datetime_string


def request_arg(request: pyramid.request.Request, name: str, fallback: Optional[str] = None) -> Optional[str]:
    return str(value).strip() if (value := request.params.get(name, None)) is not None else fallback


def request_arg_int(request: pyramid.request.Request, name: str, fallback: Optional[int] = 0) -> Optional[Any]:
    if (value := request_arg(request, name)) is not None:
        try:
            return int(value)
        except Exception:
            pass
    return fallback


def request_arg_bool(request: pyramid.request.Request, name: str, fallback: Optional[bool] = False) -> Optional[bool]:
    return fallback if (value := request_arg(request, name)) is None else (value.lower() == "true")


def request_args(request: pyramid.request.Request,
                 name: str, fallback: Optional[str] = None, duplicates: bool = False) -> List[str]:
    args = []
    if isinstance(value := request.params.getall(name), list):
        # Note that request.paramss.getall always returns a list,
        # even if the named query parameter is not specified at all.
        if value == []:
            if request.params.get(name) is None:
                # Only return the fallback if the named query parameter was not specified at all.
                return fallback
        for item in value:
            if isinstance(item, str) and (item := item.strip()):
                if (item not in args) or (duplicates is True):
                    args.append(item)
    return args


def parse_date_range_related_arguments(
        from_date: Optional[Union[str, datetime, date]],
        thru_date: Optional[Union[str, datetime, date]],
        nmonths: Optional[Union[str, int]] = None,
        include_current_month: bool = True,
        strings: bool = False) -> Tuple[Optional[Union[str, datetime]], Optional[Union[str, datetime]]]:

    """
    Returns from/thru dates based on the given from/thru date arguments and optional nmonths argument.
    Given dates may be datetime or date objects or strings. Returned dates are datetime objects, or
    if the the given strings arguments is True, then strings (formatted as YYYY-MM-DD).

    If both of the given from/thru dates are specified/valid then those are returned
    and the given nmonths argument is not used.

    If only the given from date is specified then a None thru date is returned, UNLESS the given nmonths
    argument represents a positive integer, in which case the returned thru date will be nmonths months
    subsequent to the given from date; or if the given nmonths represents zero, in which case the
    returned thru date will be the last date of the month of the given from date.

    If only the given thru date is specified then a None from date is returned, UNLESS the given nmonths
    argument represents a negative integer, in which case the returned from date will be nmonths monthss
    previous to the given thru date; or if the given nmonths represents zero, in which case
    the returned from date will be the first date of the month of the given thru date.

    If neither the given from/thru dates are specified then None is returns for both, UNLESS the given
    nmonths arguments represents a non-zero integer, in which case the returned from/thru dates will represent
    the past (absolute value) nmonths months starting with the month previous to the month of "today"; however
    if the include_current_month is True it is rather the past nmonths starting with the month of "today".
    """
    from_date = parse_datetime_string(from_date, notz=True)
    thru_date = parse_datetime_string(thru_date, last_day_of_month_if_no_day=True, notz=True)
    if not isinstance(nmonths, int):
        if isinstance(nmonths, str) and (nmonths := nmonths.strip()):
            try:
                nmonths = int(nmonths)
            except Exception:
                nmonths = 0
        else:
            nmonths = 0
    if from_date:
        if (not thru_date) and isinstance(nmonths, int):
            if nmonths > 0:
                thru_date = _add_months(from_date, nmonths)
            elif nmonths == 0:
                thru_date = _get_last_date_of_month(from_date)
    elif thru_date:
        if isinstance(nmonths, int):
            if nmonths < 0:
                from_date = _add_months(thru_date, nmonths)
            elif nmonths == 0:
                from_date = _get_first_date_of_month(thru_date)
    elif isinstance(nmonths, int) and ((nmonths := abs(nmonths)) != 0):
        # If no (valid) from/thru dates given, but the absolute value of nmonths is a non-zero integer, then returns
        # from/thru dates for the last nmonths month ending with the last day of month previous to the current month.
        # thru_date = _add_months(_get_last_date_of_month(), -1)
        thru_date = _get_last_date_of_month()
        if include_current_month is not True:
            thru_date = _add_months(thru_date, -1)
        from_date = _add_months(thru_date, -nmonths)
    if strings is True:
        return (from_date.strftime(f"%Y-%m-%d") if from_date else None,
                thru_date.strftime(f"%Y-%m-%d") if thru_date else None)
    return from_date, thru_date


def parse_datetime_string(value: Union[str, datetime, date],
                          last_day_of_month_if_no_day: bool = False,
                          notz: bool = False) -> Optional[datetime]:
    """
    Wrapper around dcicutils.datetime_utils.parse_datetime_string to handle a few special cases for convenience.
    """
    last_day_of_month = False
    if not isinstance(value, datetime):
        if isinstance(value, date):
            value = datetime.combine(value, datetime.min.time())
        elif isinstance(value, str):
            if (len(value) == 8) and value.isdigit():
                # Special case to accept for example "20241206" to mean "2024-12-06".
                value = f"{value[0:4]}-{value[4:6]}-{value[6:8]}"
            elif (len(value) == 7) and (value[4] == "-") and value[0:4].isdigit() and value[5:].isdigit():
                # Special case to accept for example "2024-10" to mean "2024-10-01".
                value = f"{value}-01"
                last_day_of_month = last_day_of_month_if_no_day
            elif (len(value) == 7) and (value[2] == "/") and value[0:2].isdigit() and value[3:].isdigit():
                # Special case to accept for example "11/2024" to mean "2024-11-01".
                value = f"{value[3:]}-{value[0:2]}-01"
                last_day_of_month = last_day_of_month_if_no_day
            elif (len(value) == 6) and (value[1] == "/") and value[0:1].isdigit() and value[2:].isdigit():
                # Special case to accept for example "9/2024" to mean "2024-09-01".
                value = f"{value[2:]}-0{value[0:1]}-01"
                last_day_of_month = last_day_of_month_if_no_day
            if not (value := dcicutils_parse_datetime_string(value)):
                return None
        else:
            return None
    value = value.replace(tzinfo=None) if notz is True else value
    if last_day_of_month:
        value = _get_last_date_of_month(value)
    return value


def _get_first_date_of_month(day: Optional[Union[datetime, date, str]] = None) -> datetime:
    """
    Returns a datetime object representing the first day of the month of the given date;
    this given date may be a datetime or date object, or string representing a date or
    datetime; if the given argument is unspecified or incorrect then assumes "today".
    """
    if not (day := parse_datetime_string(day, notz=True)):
        day = datetime.today().replace(tzinfo=None)
    return day.replace(day=1)


def _get_last_date_of_month(day: Optional[Union[datetime, date, str]] = None) -> datetime:
    """
    Returns a datetime object representing the last day of the month of the given date;
    this given date may be a datetime or date object, or string representing a date or
    datetime; if the given argument is unspecified or incorrect then assumes "today".
    """
    if not (day := parse_datetime_string(day)):
        day = datetime.today().replace(tzinfo=None)
    return datetime(day.year, day.month, calendar.monthrange(day.year, day.month)[1])


def _add_months(day: Optional[Union[datetime, date, str]] = None, nmonths: int = 0) -> datetime:
    """
    Returns a datetime object representing the given date with the given nmonths number of months
    added (or substracted if negative) to (or from) that given date.; this given date may be a
    datetime or date object, or string representing a date or datetime; if the given argument
    is unspecified or incorrect then assumes "today".
    """
    if not (day := parse_datetime_string(day, notz=True)):
        day = datetime.today().replace(tzinfo=None)
    if isinstance(nmonths, int) and (nmonths != 0):
        return day + relativedelta(months=nmonths)
    return day


def create_query_string(query_arguments: dict, base: Optional[str] = None) -> str:
    query_string = ""
    if isinstance(query_arguments, dict):
        if query_arguments := {key: value for key, value in query_arguments.items() if value is not None}:
            query_string = urlencode(query_arguments, True)
            # Hackishness to change "=!" to "!=" in query_string value for e.g. to turn this
            # {"data_category": ["!Quality Control"]} into this: data_category&21=Quality+Control
            query_string = query_string.replace("=%21", "%21=")
    if isinstance(base, str) and base:
        query_string = f"{base}?{query_string}" if query_string else base
    return query_string


def get_properties(data: dict, name: str, fallback: Optional[Any] = None, sort: bool = False) -> List[Any]:
    """
    TODO: Move this to dcicutils. Maybe much of the above too.
    Returns the values of the given property name within the given dictionary as a list, where the
    given property name can be a dot-separated list of property names, which indicate a path into
    nested dictionaries within the given dictionary; and - where if any of the elements within
    the path are lists then we iterate through each, collecting the values for each and including
    each within the list of returned values.
    """
    if isinstance(data, dict) and isinstance(name, str) and name:
        if keys := name.split("."):
            nkeys = len(keys) ; key_index_max = nkeys - 1  # noqa
            for key_index in range(nkeys):
                if (value := data.get(keys[key_index], None)) is not None:
                    if key_index == key_index_max:
                        return [value]
                    elif isinstance(value, dict):
                        data = value
                        continue
                    elif isinstance(value, list) and value and ((sub_key_index := key_index + 1) < nkeys):
                        sub_key = ".".join(keys[sub_key_index:])
                        values = []
                        for element in value:
                            if isinstance(element_value := get_properties(element, sub_key), list):
                                for element_value_item in element_value:
                                    if (element_value_item is not None) and (element_value_item not in values):
                                        values.append(element_value_item)
                            elif (element_value is not None) and (element_value not in values):
                                values.append(element_value)
                        return sorted(values) if (sort is True) else values
                break
    return fallback if isinstance(fallback, list) else ([] if fallback is None else [fallback])
