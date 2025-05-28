from typing import Any, Dict, List, Optional


from . import(
    item as item_utils
)
from .utils import (
    get_property_value_from_identifier,
    get_property_values_from_identifiers,
    RequestHandler,
)


def get_grouping_term(properties: Dict[str, Any]) -> str:
    """Get grouping term from properties."""
    return properties.get("grouping_term","")


def get_top_grouping_term(
    properties: Dict[str, Any],
    request_handler: RequestHandler,
    tag: Optional[str] = None
) -> List[str]:
    """
    Get top grouping term associated with ontology term recursively.
    
    If grouping_term is not present, return display_title of item.
    If `tag` is set, grab the first grouping term with the appropriate tag 
    (e.g. germ_layer, tissue_type)
    """
    grouping_term = get_grouping_term(properties)
    if grouping_term:
        to_get = set(
            get_property_values_from_identifiers(
                request_handler, [grouping_term], item_utils.get_uuid
            )
        )     
        seen = set()
        top = None
        while to_get:
            uuid = to_get.pop()
            if uuid in seen:
                continue
            seen.add(uuid)
            top = uuid
            to_get.update(
                get_property_value_from_identifier(
                    request_handler,
                    get_grouping_term(request_handler.get_item(uuid)),
                    item_utils.get_uuid,
                )
            )
            if tag:
                tags = get_property_value_from_identifier(
                    request_handler, top, item_utils.get_tags
                )
                import pdb; pdb.set_trace()
                if tag in tags:
                    return get_property_value_from_identifier(
                        request_handler,
                        top,
                        item_utils.get_display_title
                    )
        return get_property_value_from_identifier(
            request_handler,
            top,
            item_utils.get_display_title
        )
    else:
        if tag:
            tags = item_utils.get_tags(properties)
            if tag in tags:
                return item_utils.get_display_title(properties)
            return None
        return item_utils.get_display_title(properties)
    

def get_valid_protocol_ids(properties: Dict[str, Any]) -> str:
    """Get valid_protocol_ids from properties."""
    return properties.get("valid_protocol_ids",[])