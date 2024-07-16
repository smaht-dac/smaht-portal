from typing import Any, Dict
from . import item as item_utils

def is_dsa(properties: Dict[str, Any]) -> bool:
    """Check if item is a DonorSpecificAssembly."""
    return item_utils.get_type(properties) == "DonorSpecificAssembly"