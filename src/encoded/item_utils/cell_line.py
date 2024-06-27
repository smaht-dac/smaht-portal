from typing import Any, Dict, Union


def get_donor(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get donor from cell culture."""
    return properties.get("donor", "")
