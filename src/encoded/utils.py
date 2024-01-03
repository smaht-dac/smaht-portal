from typing import Any, Dict, Union

from pyramid.request import Request
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
