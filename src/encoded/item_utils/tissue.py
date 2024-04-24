from typing import Any, Dict, Union

from . import item
from .utils import get_study_from_external_id


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
