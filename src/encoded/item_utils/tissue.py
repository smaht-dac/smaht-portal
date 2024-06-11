import re
from typing import Any, Dict, Union

from . import constants, donor, item


def is_tissue(properties: Dict[str, Any]) -> bool:
    """Check if sample source is tissue."""
    return item.get_type(properties) == "Tissue"


def get_donor(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get donor associated with tissue."""
    return properties.get("donor", "")


def get_location(properties: Dict[str, Any]) -> str:
    """Get location of tissue."""
    return properties.get("location", "")


def get_study(properties: Dict[str, Any]) -> str:
    """Get study associated with tissue.

    Parse external ID to see if matches TPC naming standards to
    indicate benchmarking vs. production. TTD tissues unlikely to match
    TPC naming standards, but not impossible; may be more robust to
    check submission centers or more detailed regex on TPC nomenclature.
    """
    external_id = item.get_external_id(properties)
    return get_study_from_external_id(external_id)


TPC_ID_COMMON_PATTERN = rf"{donor.TPC_ID_COMMON_PATTERN}-[0-9][A-Z]{1,2}"
BENCHMARKING_ID_REGEX = re.compile(
    rf"{constants.BENCHMARKING_PREFIX}{TPC_ID_COMMON_PATTERN}$"
)
PRODUCTION_ID_REGEX = re.compile(
    rf"{constants.PRODUCTION_PREFIX}{TPC_ID_COMMON_PATTERN}$"
)


def get_study_from_external_id(external_id: str) -> str:
    """get "study" (a.k.a. production or benchmarking) from external id.

    note: impossible to determine study from external id alone, but
    should suffice for ids from tpc. primary concern is ttd ids can
    also match criteria and be incorrectly identified. if this becomes
    an issue, may need to check submission/sequencing centers and add
    metadata there appropriately.
    """
    if PRODUCTION_ID_REGEX.match(external_id):
        return constants.production_study
    if BENCHMARKING_ID_REGEX.match(external_id):
        return constants.benchmarking_study
    return ""


def get_project_id(properties: Dict[str, Any]) -> str:
    """Get project ID associated with tissue."""
    external_id = item.get_external_id(properties)
    return get_project_id_from_external_id(external_id)


def get_project_id_from_external_id(external_id: str) -> str:
    """Get project ID from external ID."""
    if PRODUCTION_ID_REGEX.match(external_id):
        return constants.PRODUCTION_PREFIX
    if BENCHMARKING_ID_REGEX.match(external_id):
        return constants.BENCHMARKING_PREFIX
    return ""


def get_donor_kit_id(properties: Dict[str, Any]) -> str:
    """Get donor kit ID associated with tissue."""
    external_id = item.get_external_id(properties)
    return get_donor_kit_id_from_external_id(external_id)


def get_donor_kit_id_from_external_id(external_id: str) -> str:
    """Get donor kit ID from external ID."""
    if PRODUCTION_ID_REGEX.match(external_id):
        return external_id.split("-")[0].strip(constants.PRODUCTION_PREFIX)
    if BENCHMARKING_ID_REGEX.match(external_id):
        return external_id.split("-")[0].strip(constants.BENCHMARKING_PREFIX)
    return ""


def get_protocol_id(properties: Dict[str, Any]) -> str:
    """Get protocol ID associated with tissue."""
    external_id = item.get_external_id(properties)
    return get_protocol_id_from_external_id(external_id)


def get_protocol_id_from_external_id(external_id: str) -> str:
    """Get protocol ID from external ID."""
    if PRODUCTION_ID_REGEX.match(external_id):
        return external_id.split("-")[1]
    if BENCHMARKING_ID_REGEX.match(external_id):
        return external_id.split("-")[1]
    return ""
