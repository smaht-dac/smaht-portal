from typing import Any, Dict, List, Optional

from ..item_utils.utils import (
    RequestHandler,
    dedupe_identifiers,
    get_property_values_from_identifiers,
)

from ..item_utils import tissue as tissue_utils


def get_tissues(
    properties: Dict[str, Any]
) -> List[str]:
    """Get tissues associated with analysis run."""
    return properties.get("tissues", [])


def get_donors(
        properties: Dict[str, Any],
        request_handler: Optional[RequestHandler] = None
) -> list:
    if "donors" in properties:
        return properties.get("donors", [])
    elif "tissues" in properties:
        if request_handler:
            # dedupe_identifiers (not list(set(...))) so a tissue whose @@object
            # returned donor as an embedded dict (instead of a bare linkTo path)
            # doesn't crash this with `unhashable type: 'dict'`.
            return dedupe_identifiers(get_property_values_from_identifiers(
                request_handler, get_tissues(properties), tissue_utils.get_donor
            ))
    return []
