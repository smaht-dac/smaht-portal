from typing import Any, Dict, Optional, Union

from dcicutils.misc_utils import to_camel_case
from pyramid.request import Request
from snovault.types.base import get_item_or_none
from webtest import TestApp


def get_remote_user(item_with_environ: Union[Request, TestApp]) -> str:
    """Get remote user from associated environment."""
    if isinstance(item_with_environ, Request):
        environ = item_with_environ.environ
    elif isinstance(item_with_environ, TestApp):
        environ = item_with_environ.extra_environ
    else:
        raise TypeError(f"Unexpected type: {type(item_with_environ)}")
    return get_environ_remote_user(environ)


def get_environ_remote_user(environ: Dict[str, Any]) -> str:
    """Get remote user from associated environment."""
    return environ.get("REMOTE_USER", "")


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
