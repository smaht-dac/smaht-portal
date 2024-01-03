from typing import Any, Dict

from dcicutils.misc_utils import to_camel_case
from pyramid.request import Request
from snovault.types.base import get_item_or_none


def get_item(
    request: Request,
    identifier: str,
    collection: str = None,
    frame: str = "object",
) -> Dict[str, Any]:
    """Wrapper for get_item_or_none with consistent return type."""
    return get_item_or_none(
        request, identifier, itype=to_camel_case(collection), frame=frame
    ) or {}
