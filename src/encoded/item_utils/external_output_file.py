from typing import List, Dict, Any

def get_tissues(
    properties: Dict[str, Any]
) -> List[str]:
    """Get tissues associated with external output file."""
    return properties.get("tissues", [])