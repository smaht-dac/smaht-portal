from typing import Any, Dict, List


from . import(
    item as item_utils
)
from .utils import (
    get_property_values_from_identifiers,
    RequestHandler,
)


def get_grouping_term(properties: Dict[str, Any]) -> str:
    """Get grouping term from properties."""
    return properties.get("grouping_term","")


def get_all_grouping_terms(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get top grouping term associated with ontology term recursively."""
    grouping_terms = get_grouping_term(properties)
    to_get = set(
        get_property_values_from_identifiers(
            request_handler, grouping_terms, item_utils.get_at_id
        )
    )
    seen = set()
    while to_get:
        uuid = to_get.pop()
        if uuid in seen:
            continue
        seen.add(uuid)
        to_get.update(
            get_property_values_from_identifiers(
                request_handler,
                get_grouping_term(request_handler.get_item(uuid)),
                item_utils.get_uuid,
            )
        )
    return list(seen)