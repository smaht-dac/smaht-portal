from typing import Any, Dict, Optional

from pyramid.request import Request
from snovault.types.base import get_item_or_none


def get_item_properties_via_request(
    request: Request,
    item_identifier: str,
    collection: Optional[str] = None,
    frame: Optional[str] = "object",
) -> Dict[str, Any]:
    result = get_item_or_none(request, item_identifier, itype=collection, frame=frame)
    if result is not None:
        return result
    return {}
