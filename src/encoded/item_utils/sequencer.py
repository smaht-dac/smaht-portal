from typing import Any, Dict, List


def get_platform(properties: Dict[str, Any]) -> List[str]:
    """Get valid sequencers from properties."""
    return properties.get("platform", "")



