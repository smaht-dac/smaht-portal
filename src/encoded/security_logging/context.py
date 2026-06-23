"""Safe extraction of actor/source context from a Pyramid request.

Every accessor here is defensive: a security-event log call must never raise into
a request, and many call sites are anonymous or only partially authenticated.
Sensitive request headers (the Auth0 bearer JWT, cookies, etc.) are redacted.
"""
from typing import Any, Dict, List, Optional

from structlog import getLogger

log = getLogger(__name__)


# Headers whose values must never be logged (matched case-insensitively).
SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-auth-token",
    "proxy-authorization",
    "www-authenticate",
}
REDACTED = "<redacted>"

# Principal prefixes used by the snovault auth policies.
_USERID_PREFIX = "userid."
_ACCESSKEY_PREFIX = "accesskey."
_REMOTEUSER_PREFIX = "remoteuser."


def sanitize_headers(headers) -> Dict[str, str]:
    """Return a dict of headers with sensitive values redacted."""
    try:
        return {
            k: (REDACTED if k.lower() in SENSITIVE_HEADERS else v)
            for k, v in headers.items()
        }
    except Exception:  # noqa - never let logging break a request
        return {}


def _effective_principals(request) -> List[str]:
    try:
        principals = getattr(request, "effective_principals", None)
        return list(principals) if principals else []
    except Exception:  # noqa
        return []


def extract_source(request) -> Dict[str, Any]:
    """Extract request-origin metadata. Never raises."""
    source: Dict[str, Any] = {}
    if request is None:
        return source
    try:
        source["remote_ip"] = getattr(request, "remote_addr", None)
    except Exception:  # noqa
        source["remote_ip"] = None
    try:
        source["user_agent"] = str(getattr(request, "user_agent", None) or "")
    except Exception:  # noqa
        source["user_agent"] = None
    try:
        source["request_path"] = getattr(request, "path_info", None)
    except Exception:  # noqa
        source["request_path"] = None
    try:
        source["request_method"] = getattr(request, "method", None)
    except Exception:  # noqa
        source["request_method"] = None
    try:
        source["request_headers"] = sanitize_headers(request.headers)
    except Exception:  # noqa
        source["request_headers"] = {}
    return source


def extract_actor(request, *, email: Optional[str] = None) -> Dict[str, Any]:
    """Extract who is acting from the request's principals. Never raises.

    ``email`` may be supplied by the call site (which often already knows it);
    we never do a DB lookup here.
    """
    actor: Dict[str, Any] = {
        "user_uuid": None,
        "email": email,
        "auth_method": "anonymous",
        "principals": [],
    }
    if request is None:
        return actor
    principals = _effective_principals(request)
    # Filter out the noisy system/group principals from what we record, but keep
    # group/role principals which are useful for security review.
    actor["principals"] = [p for p in principals if p.startswith(("group.", "role.", "accesskey.", "userid."))]
    for principal in principals:
        if principal.startswith(_USERID_PREFIX):
            actor["user_uuid"] = principal[len(_USERID_PREFIX):]
            break
    # Infer the authentication method.
    if any(p.startswith(_ACCESSKEY_PREFIX) for p in principals):
        actor["auth_method"] = "accesskey"
    elif any(p.startswith(_REMOTEUSER_PREFIX) for p in principals):
        actor["auth_method"] = "remoteuser"
    elif actor["user_uuid"]:
        actor["auth_method"] = "auth0"
    return actor
