from typing import Any, Dict, Union, Optional, List
from .utils import RequestHandler, get_property_value_from_identifier
from . import (
    donor_specific_assembly as dsa_utils,
    item as item_utils
)

def is_supplementary_file(properties: Dict[str, Any]) -> bool:
    """Check if item is a supplementary file."""
    return item_utils.get_type(properties) == "SupplementaryFile"


def get_donor_specific_assembly(properties: Dict[str, Any]) -> Union[str, Dict[str, Any], None]:
    """Get donor_specific_assembly from properties."""
    return properties.get("donor_specific_assembly", "")


def get_derived_from(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get derived_from file sets associated with file."""
    if request_handler:
        return get_property_value_from_identifier(
            request_handler,
            get_donor_specific_assembly(properties),
            dsa_utils.get_derived_from,
        )
    return properties.get("derived_from", [])



def get_dsa_software(
        properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None 
) -> List[Union[str, Dict[str, Any]]]:
    """Get software from donor-specific assembly associated with file."""
    if request_handler:
        return get_property_value_from_identifier(
            request_handler,
            get_donor_specific_assembly(properties),
            dsa_utils.get_software,
        )
    return []