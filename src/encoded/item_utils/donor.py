import re
from typing import Any, Dict, Union

from . import constants


TPC_ID_COMMON_PATTERN = r"[0-9]{3}"
BENCHMARKING_ID_REGEX = rf"{constants.BENCHMARKING_PREFIX}{TPC_ID_COMMON_PATTERN}$"

PRODUCTION_ID_REGEX = rf"{constants.PRODUCTION_PREFIX}{TPC_ID_COMMON_PATTERN}$"

TPC_ALT_ID_REGEX = rf"{constants.TPC_ALT_DONOR_PREFIX}{TPC_ID_COMMON_PATTERN}"

PRODUCTION_DONOR_REGEX = re.compile(
    rf"{PRODUCTION_ID_REGEX}$"
)
BENCHMARKING_DONOR_REGEX = re.compile(
    rf"{BENCHMARKING_ID_REGEX}$"
)
TPC_ALT_DONOR_REGEX = re.compile(
    rf"{TPC_ALT_ID_REGEX}$"
)

def get_age(properties: Dict[str, Any]) -> Union[int, None]:
    """Get age from properties."""
    return properties.get("age")


def get_sex(properties: Dict[str, Any]) -> str:
    """Get sex from properties."""
    return properties.get("sex", "")


def is_tpc_submitted(properties: Dict[str, Any]) -> str:
    """Check if tpc_submitted is True."""
    return properties.get("tpc_submitted","") == "True"