from typing import Any, Dict

from . import item


def is_tissue_sample(properties: Dict[str, Any]) -> bool:
    return "TissueSample" in item.get_type(properties)


def get_category(properties: Dict[str, Any]) -> str:
    """Get category from properties."""
    return properties.get("category", "")


def is_homogenate(properties: Dict[str, Any]) -> bool:
    return get_category(properties) == "Homogenate"
