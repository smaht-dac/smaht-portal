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
    claims_identity_fields,
    emit_audit_event,
    identity_fields,
)


# A request whose transaction never committed did not do what its view
# believed it did, so a queued success is downgraded rather than published.
REQUEST_FAILED_REASON = "request_failed"
UNCOMMITTED_OUTCOMES = frozenset({"success", "allowed"})


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


def _identity_after_commit(request):
    """Resolve actor identity for a tween-generated event, safely.

    This tween runs outside ``pyramid_tm``, and resolving an identity reads the
    database twice - snovault's groupfinder loads the User to compute
    principals, and the audit builder reads its properties. ``DBSession`` is
    registered with ``zope.sqlalchemy``, so doing that after the request's
    transaction has closed would open an implicit transaction that nothing
    commits and leave the connection idle-in-transaction. Events queued by a
    view are unaffected: they resolved their identity while the request's own
    transaction was still open.
    """
    transaction_manager = getattr(request, "tm", None)
    if transaction_manager is None:
        return identity_fields(request)
    try:
        with transaction_manager:
            return identity_fields(request)
    except Exception:
        log.exception("Failed to resolve audit identity after commit")
        return claims_identity_fields(request)


def _session_expiry_event(request):
    """Build the automatic-logout event when a session credential lapsed.

    A lapsed credential authenticates nobody, so there is no portal User to
    resolve; the verified claims the token left behind are all this event can
    honestly name, and reading them costs no database access.
    """
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
        identity=claims_identity_fields(request),
        reason=auth_failure_reason(request) or AUTH_FAILURE_TOKEN_EXPIRED,
    )


def _denial_event(request, response, already_recorded):
    """Build a generic denial event when no event already explains the refusal."""
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
        identity=_identity_after_commit(request),
        reason=auth_failure_reason(request),
    )


def _downgrade_uncommitted(events, response, request_failed):
    """Never publish a success the request did not actually complete.

    A commit failure in ``pyramid_tm`` raises past every view, so a queued
    "group revoked" or "file deleted" describes a change that was rolled back.
    A 401 is not such a case - an explicit logout deliberately returns one -
    so only a missing response or a server error downgrades an outcome.
    """
    status_code = getattr(response, "status_code", None)
    server_error = isinstance(status_code, int) and status_code >= 500
    if not (request_failed or server_error):
        return
    for event in events:
        fields = event["fields"]
        if fields.get("outcome") in UNCOMMITTED_OUTCOMES:
            fields["outcome"] = "failure"
            fields.setdefault("reason", REQUEST_FAILED_REASON)


def _explains_the_refusal(event):
    """True when an event already accounts for a 401/403 response."""
    fields = event["fields"]
    return (
        fields.get("outcome") in ("denied", "failure")
        # An explicit logout and an expiry both answer with 401 by design.
        or fields.get("event_type") == EVENT_TYPE_AUTHENTICATION
    )


def _flush(request, response, duration_seconds, request_failed=False):
    """Attach response fields to every queued event and write them out."""
    queue = getattr(request, AUDIT_EVENT_QUEUE_ATTR, None)
    events = list(queue) if isinstance(queue, list) else []
    if isinstance(queue, list):
        del queue[:]

    _downgrade_uncommitted(events, response, request_failed)

    expiry = _session_expiry_event(request)
    if expiry is not None:
        events.append(expiry)

    denial = _denial_event(
        request, response, any(_explains_the_refusal(event) for event in events)
    )
    if denial is not None:
        events.append(denial)

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
        request_failed = False
        try:
            response = handler(request)
            return response
        except Exception as caught:
            # An HTTPException that escapes the exception view is still the
            # response the client receives, so audit it as such. Anything else
            # - a failed commit, for instance - means the request did not
            # complete, and any queued success must not stand.
            if getattr(caught, "status_code", None) is not None:
                response = caught
            else:
                request_failed = True
            raise
        finally:
            try:
                _flush(request, response, time.perf_counter() - started,
                       request_failed=request_failed)
            except Exception:
                log.exception("Failed to emit queued audit events")

    return audit_tween
