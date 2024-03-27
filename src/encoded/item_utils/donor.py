from typing import Any, Dict


def get_id(properties: Dict[str, Any]) -> str:
    """Get id from properties."""
    return properties.get("id", "")
