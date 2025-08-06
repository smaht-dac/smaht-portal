from typing import Dict, Any


def get_donor(properties: Dict[str, Any]):
    """Get donor from properties."""
    return properties.get("donor","")