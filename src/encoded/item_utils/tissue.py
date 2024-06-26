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
    return properties.get("anatomical_location", "")


def get_study(properties: Dict[str, Any]) -> str:
    """Get study associated with tissue.

    Parse external ID to see if matches TPC naming standards to
    indicate benchmarking vs. production. TTD tissues unlikely to match
    TPC naming standards, but not impossible; may be more robust to
    check submission centers or more detailed regex on TPC nomenclature.
    """
    if is_benchmarking(properties):
        return constants.BENCHMARKING_STUDY
    if is_production(properties):
        return constants.PRODUCTION_STUDY
    return ""


TPC_ID_COMMON_PATTERN = donor.TPC_ID_COMMON_PATTERN + r"-[0-9][A-Z]{1,2}"
BENCHMARKING_ID_REGEX = re.compile(
    rf"{constants.BENCHMARKING_PREFIX}{TPC_ID_COMMON_PATTERN}$"
)
PRODUCTION_ID_REGEX = re.compile(
    rf"{constants.PRODUCTION_PREFIX}{TPC_ID_COMMON_PATTERN}$"
)


def is_benchmarking(properties: Dict[str, Any]) -> bool:
    """Check if tissue is from benchmarking study."""
    external_id = item.get_external_id(properties)
    return BENCHMARKING_ID_REGEX.match(external_id) is not None


def is_production(properties: Dict[str, Any]) -> bool:
    """Check if tissue is from production study."""
    external_id = item.get_external_id(properties)
    return PRODUCTION_ID_REGEX.match(external_id) is not None


def get_project_id(properties: Dict[str, Any]) -> str:
    """Get project ID associated with tissue."""
    if is_benchmarking(properties):
        return constants.BENCHMARKING_PREFIX
    if is_production(properties):
        return constants.PRODUCTION_PREFIX
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
    if is_benchmarking(properties) or is_production(properties):
        external_id = item.get_external_id(properties)
        return get_protocol_id_from_external_id(external_id)
    return ""


def get_protocol_id_from_external_id(external_id: str) -> str:
    """Get protocol ID from external ID."""
    return external_id.split("-")[1]
