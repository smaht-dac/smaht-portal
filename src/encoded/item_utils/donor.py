import re
from typing import Any, Dict, Union, List

from . import (
    constants,
    item,
)


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


def get_study(properties: Dict[str, Any]) -> str:
    """Get study associated with donor.

    Parse external ID to see if matches TPC naming standards to
    indicate benchmarking vs. production. TTD donors unlikely to match
    TPC naming standards, but not impossible; may be more robust to
    check submission centers or more detailed regex on TPC nomenclature.
    """
    if is_benchmarking(properties):
        return constants.BENCHMARKING_STUDY
    if is_production(properties):
        return constants.PRODUCTION_STUDY
    return ""


def is_valid_external_id(external_id: str) -> bool:
    """Check if donor external_id matches TPC Donor nomenclature."""
    return PRODUCTION_DONOR_REGEX.match(external_id) is not None or BENCHMARKING_DONOR_REGEX.match(external_id) is not None or TPC_ALT_DONOR_REGEX.match(external_id) is not None


def is_benchmarking(properties: Dict[str, Any]) -> bool:
    """Check if donor is from benchmarking study."""
    external_id = item.get_external_id(properties)
    return BENCHMARKING_DONOR_REGEX.match(external_id) is not None


def is_production(properties: Dict[str, Any]) -> bool:
    """Check if donor is from production study."""
    external_id = item.get_external_id(properties)
    return PRODUCTION_DONOR_REGEX.match(external_id) is not None


def is_donor(properties: Dict[str, Any]) -> bool:
    """Check if item is a Donor item."""
    return item.get_types(properties) == "Donor"


def is_abstract_donor(properties: Dict[str, Any]) -> bool:
    """Check if item is a type of AbstactDonor item."""
    return "AbstractDonor" in item.get_types(properties)



def get_tissues(properties: Dict[str, Any]) -> Union[List[str], None]:
    """Get tissues revlink from properties."""
    return properties.get("tissues",[])


def get_protected_donor(properties: Dict[str, Any]) -> Union[str, Dict[str, Any], None]:
    """Get protected donor from properties."""
    return properties.get("protected_donor","")
