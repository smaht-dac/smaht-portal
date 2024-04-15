from typing import Any, Dict

from .item import get_type


def is_tissue(properties: Dict[str, Any]) -> bool:
    """Check if sample source is tissue."""
    return get_type(properties) == "Tissue"


def get_donor(properties: Dict[str, Any]) -> str:
    """Get donor associated with tissue."""
    return properties.get("donor", "")
