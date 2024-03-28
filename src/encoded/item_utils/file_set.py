from typing import Any, Dict, List


def get_sequencing(properties: Dict[str, Any]) -> str:
    """Get sequencing connected to file set."""
    return properties.get("sequencing", "")


def get_libraries(file_set: Dict[str, Any]) -> List[str]:
    """Get libraries connected to file set."""
    return file_set.get("libraries", [])
