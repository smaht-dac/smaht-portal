from typing import Any, Dict, Union


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


def get_grouping_term_from_tag(
    properties: Dict[str, Any],
    request_handler: RequestHandler,
    tag: str
) -> Union[str, None]:
    """
    Get grouping term with specified tag from ontology term recursively.

    Search through linked OntologyTerms to grab the first item with the appropriate tag 
    (e.g. germ_layer, tissue_type). If it is not present, return None
    """
    tags = item_utils.get_tags(properties)
    if tag in tags:
        return item_utils.get_display_title(properties)
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
                get_property_values_from_identifiers(
                    request_handler,
                    [get_grouping_term(request_handler.get_item(uuid))],
                    item_utils.get_uuid
                )
            )
            tags = get_property_value_from_identifier(
                request_handler, top, item_utils.get_tags
            )
            if tag in tags:
                return get_property_value_from_identifier(
                    request_handler,
                    top,
                    item_utils.get_display_title
                )
        print("No tag found after recursive search")
        return None
    else:
        print("No grouping term found")
        return None
    

def get_valid_protocol_ids(properties: Dict[str, Any]) -> str:
    """Get valid_protocol_ids from properties."""
    return properties.get("valid_protocol_ids",[])