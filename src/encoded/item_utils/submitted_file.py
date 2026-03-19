from typing import Any, Dict, Union, Optional, List

from .item import get_types
from .utils import (
    RequestHandler,
    get_property_values_from_identifiers,
)
from ..item_utils import file as file_utils


def is_submitted_file(properties: Dict[str, Any]) -> bool:
    return "SubmittedFile" in get_types(properties)


def get_derived_from(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get derived_from from properties."""
    return properties.get("derived_from", [])


def get_derived_from_file_sets(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get file_sets of the derived_from files associated with file."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_derived_from(properties),
            file_utils.get_file_sets,
        )
    return properties.get("file_sets", [])
