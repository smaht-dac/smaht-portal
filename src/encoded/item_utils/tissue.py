from typing import Any, Dict

from . import constants
from . import item


def is_tissue(properties: Dict[str, Any]) -> bool:
    """Check if sample source is tissue."""
    return item.get_type(properties) == "Tissue"


def get_donor(properties: Dict[str, Any]) -> str:
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
    if external_id.startswith(constants.BENCHMARKING_PREFIX):
        return constants.BENCHMARKING_STUDY
    if external_id.startswith(constants.PRODUCTION_PREFIX):
        return constants.PRODUCTION_STUDY
    return ""
