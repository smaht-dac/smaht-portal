from typing import Any, Dict


def get_category(properties: Dict[str, Any]) -> str:
    """Get category from properties."""
    return properties.get("category", "")
