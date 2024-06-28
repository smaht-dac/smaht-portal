from typing import Any, Dict, List, Union


def get_file_sets(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get file sets for the meta workflow run."""
    return properties.get("file_sets", [])
