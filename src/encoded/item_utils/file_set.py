from typing import Any, Dict, List, Union


def get_sequencing(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get sequencing connected to file set."""
    return properties.get("sequencing", "")


def get_libraries(file_set: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get libraries connected to file set."""
    return file_set.get("libraries", [])
