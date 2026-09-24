"""Response-level enrichment and completion of CADR audit events.

Views and item models know *what* happened; only the response knows the HTTP
status, the content type, the number of bytes this application actually sent,
and how long the request took.  This tween owns those four fields.

It also emits the two audit events that have no view of their own:

* a generic authorization denial, for a credentialed request the application
  refused without a more specific event already saying so, and
* an automatic logout, when a presented session credential was expired or
  rejected and the response therefore clears the session cookie.

The tween must never change application behavior, so every step is guarded and
a failure to log is swallowed rather than propagated to the client.
"""

import time

import pyramid.tweens
import structlog

from .audit_logging import (
    AUDIT_EVENT_QUEUE_ATTR,
    AUTH_FAILURE_TOKEN_EXPIRED,
    EVENT_TYPE_AUTHENTICATION,
    EVENT_TYPE_AUTHORIZATION,
    auth_failure_reason,
    build_audit_event,
    emit_audit_event,
)


log = structlog.getLogger(__name__)

AUDIT_TWEEN_NAME = "encoded.audit_tween.audit_tween_factory"
DENIED_STATUS_CODES = frozenset({401, 403})


def includeme(config):
    config.add_tween(AUDIT_TWEEN_NAME, under=pyramid.tweens.INGRESS)


def _response_fields(response, duration_seconds):
    """Return the CADR fields only the completed response can supply."""
    fields = {"duration": round(duration_seconds, 6)}
    status_code = getattr(response, "status_code", None)
    if isinstance(status_code, int):
        fields["status"] = status_code
    content_type = getattr(response, "content_type", None)
    if isinstance(content_type, str) and content_type:
        fields["http_content_type"] = content_type
    # Only the length this application declares for its own response. The bytes
    # a client later transfers from S3 with a presigned URL are not observable
    # here and are never guessed. Never consume app_iter to find out.
    content_length = getattr(response, "content_length", None)
    if isinstance(content_length, int) and content_length >= 0:
        fields["bytes"] = content_length
    return fields


def _presented_credential(request):
    """True when the request carried a session credential of some kind."""
    try:
        from snovault.authentication import get_jwt

        if get_jwt(request):
            return True
    except Exception:
        pass
    try:
        return request.authorization is not None
    except Exception:
        return False


def _session_expiry_event(request):
    """Build the automatic-logout event when a session credential lapsed."""
    if not getattr(request, "auth0_expired", False):
        return None
    if not _presented_credential(request):
        return None
    return build_audit_event(
        request,
        "Session credential no longer valid",
        EVENT_TYPE_AUTHENTICATION,
        "session_expired",
        "expired",
        reason=auth_failure_reason(request) or AUTH_FAILURE_TOKEN_EXPIRED,
    )


def _denial_event(request, response, already_recorded):
    """Build a generic denial event when no view recorded a more specific one."""
    status_code = getattr(response, "status_code", None)
    if status_code not in DENIED_STATUS_CODES:
        return None
    if already_recorded:
        return None
    # An anonymous request that is simply asked to log in is not a denied
    # attempt by an identified actor; recording those would bury the real ones.
    if not _presented_credential(request):
        return None
    return build_audit_event(
        request,
        "Request denied",
        EVENT_TYPE_AUTHORIZATION,
        "access_denied",
        "denied",
        reason=auth_failure_reason(request),
    )


def _flush(request, response, duration_seconds):
    """Attach response fields to every queued event and write them out."""
    queue = getattr(request, AUDIT_EVENT_QUEUE_ATTR, None)
    events = list(queue) if isinstance(queue, list) else []
    if isinstance(queue, list):
        del queue[:]

    already_denied = any(
        event["fields"].get("outcome") in ("denied", "failure") for event in events
    )
    for extra in (_session_expiry_event(request), _denial_event(request, response, already_denied)):
        if extra is not None:
            events.append(extra)

    if not events:
        return
    response_fields = _response_fields(response, duration_seconds)
    for event in events:
        event["fields"].update(response_fields)
        emit_audit_event(event)


def audit_tween_factory(handler, registry):
    """Wrap the application so audit events complete with their response."""

    def audit_tween(request):
        try:
            setattr(request, AUDIT_EVENT_QUEUE_ATTR, [])
        except Exception:
            # Without a queue every call site simply emits immediately.
            return handler(request)
        started = time.perf_counter()
        response = None
        try:
            response = handler(request)
            return response
        except Exception as caught:
            # An HTTPException that escapes the exception view is still the
            # response the client receives, so audit it as such.
            if getattr(caught, "status_code", None) is not None:
                response = caught
            raise
        finally:
            try:
                _flush(request, response, time.perf_counter() - started)
            except Exception:
                log.exception("Failed to emit queued audit events")

    return audit_tween
