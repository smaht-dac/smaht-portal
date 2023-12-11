from typing import Any, Dict, Optional, Union

from dcicutils.misc_utils import to_camel_case
from pyramid.request import Request
from snovault import Item
from snovault.types.base import get_item_or_none


def get_item(
    request: Request,
    item_identifier: str,
    collection: Optional[str] = None,
    frame: Optional[str] = "object",
) -> Dict[str, Any]:
    """Get item via subrequest.

    Wrapper around get_item_or_none() for consistent return value type.
    """
    item_type = to_camel_case(collection) if collection else collection
    result = get_item_or_none(request, item_identifier, itype=item_type, frame=frame)
    if result is not None:
        return result
    return {}


def get_properties(properties_container: Union[Request, Item]) -> Dict[str, Any]:
    """Get item properties from given object."""
    if isinstance(properties_container, Request):
        return properties_container.json or {}
    if isinstance(properties_container, Item):
        return properties_container.properties or {}
    raise NotImplementedError(
        f"Unable to get properties from {properties_container.__class__.__name__}"
    )
