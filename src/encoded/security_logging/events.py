"""Canonical security-event schema for Splunk logging.

Defines the event-type / outcome vocabulary and ``build_event``, which assembles
the structured dict that gets shipped to Splunk. A defensive key scrub redacts any
value whose key name looks like a secret, as a last line of defense against the
instrumentation accidentally passing sensitive data through ``**details``.
"""
import datetime
import re
from typing import Any, Dict, Optional


class EventType:
    """String constants for the ``event_type`` field of a security event."""
    LOGIN = "login"
    LOGIN_DENIED = "login_denied"
    LOGOUT = "logout"
    REGISTRATION = "user_registration"
    RESTRICTED_EMAIL = "restricted_email_blocked"
    CREDENTIAL_CREATE = "access_key_create"
    CREDENTIAL_RESET = "access_key_reset"
    CREDENTIAL_VIEW_RAW = "access_key_view_raw"
    DATA_ACCESS = "data_access"
    DATA_DOWNLOAD = "data_download"
    ACCESS_DENIED = "access_denied"
    DATA_MODIFICATION = "data_modification"


class Outcome:
    """String constants for the ``outcome`` field of a security event."""
    SUCCESS = "success"
    FAILURE = "failure"


# Key names whose values must never be logged (matched case-insensitively as a
# substring of the key). This is the last-line defense in ``build_event``.
SECRET_KEY_PATTERN = re.compile(
    r"secret|token|password|passwd|authorization|\bjwt\b|credential", re.IGNORECASE
)
REDACTED = "<redacted>"


def _scrub(value: Any) -> Any:
    """Recursively redact dict values whose key looks like a secret."""
    if isinstance(value, dict):
        scrubbed = {}
        for k, v in value.items():
            if isinstance(k, str) and SECRET_KEY_PATTERN.search(k):
                scrubbed[k] = REDACTED
            else:
                scrubbed[k] = _scrub(v)
        return scrubbed
    if isinstance(value, (list, tuple)):
        return [_scrub(v) for v in value]
    return value


def build_event(
    *,
    event_type: str,
    outcome: str = Outcome.SUCCESS,
    actor: Optional[Dict[str, Any]] = None,
    source: Optional[Dict[str, Any]] = None,
    target: Optional[Dict[str, Any]] = None,
    app: Optional[Dict[str, Any]] = None,
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Assemble a canonical security-event dict.

    The returned structure is scrubbed of secret-looking keys before it is
    handed off to the HEC client.
    """
    event = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "event_type": event_type,
        "outcome": outcome,
        "actor": actor or {},
        "source": source or {},
        "target": target or {},
        "app": app or {},
        "correlation_id": correlation_id,
    }
    return _scrub(event)
