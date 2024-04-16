from typing import Any, Dict

from .item import get_code, get_title


def get_version(properties: Dict[str, Any]) -> str:
    """Get software version."""
    return properties.get("version", "")


def get_title_with_version(properties: Dict[str, Any]) -> str:
    """Get software name to display for file overview."""
    code = get_code(properties)
    title = get_title(properties)
    version = get_version(properties)
    if code and version:
        return f"{code} ({version})"
    if title and version:
        return f"{title} ({version})"
    return code or title
