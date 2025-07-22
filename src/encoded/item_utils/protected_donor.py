from typing import Dict, Any
from ..item_utils import (
    item as item_utils
)


def is_protected_donor(properties: Dict[str, Any]) -> bool:
    """Check if item is ProtectedDonor."""
    return item_utils.get_type(properties) == "ProtectedDonor"