from typing import List, Dict, Any

from ..item_utils.utils import (
    RequestHandler,
    get_property_values_from_identifiers
)
from ..item_utils import (
    tissue as tissue_utils
)


def get_tissues(
    properties: Dict[str, Any]
) -> List[str]:
    """Get tissues associated with external output file."""
    return properties.get("tissues", [])


def get_donors(
   properties: Dict[str, Any],
   request_handler: RequestHandler
) -> List[str]:
    """Get donors associated with external output file."""
    return set(get_property_values_from_identifiers(
        request_handler, get_tissues(properties), tissue_utils.get_donor
    ))