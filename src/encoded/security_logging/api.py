"""Public API for emitting security events from anywhere in the app.

Call sites use the typed wrappers (``log_login``, ``log_data_download``, etc.) and
pass the live Pyramid ``request``. Every call is wrapped so that a failure in the
logging path can never break the request it is instrumenting.
"""
from typing import Any, Dict, Optional

from structlog import getLogger

from .context import extract_actor, extract_source
from .events import EventType, Outcome, build_event
from .hec_client import SplunkHECClient

log = getLogger(__name__)


# Registry key under which the configured SplunkHECClient is stored.
SECURITY_LOGGER_REGISTRY_KEY = "SECURITY_HEC_CLIENT"

# Fallback client used when the registry has no client (e.g. unit tests using a
# bare DummyRequest). Disabled => routes to structlog.
_FALLBACK_CLIENT = SplunkHECClient(enabled=False)


def get_client(request) -> SplunkHECClient:
    """Return the registry's HEC client, or a disabled fallback."""
    try:
        return request.registry[SECURITY_LOGGER_REGISTRY_KEY]
    except Exception:  # noqa
        return _FALLBACK_CLIENT


def _build_app_block(request) -> Dict[str, Any]:
    try:
        settings = request.registry.settings
        return {
            "version": settings.get("snovault.app_version") or settings.get("eb_app_version"),
            "env_name": settings.get("env.name"),
        }
    except Exception:  # noqa
        return {}


def log_security_event(
    request,
    event_type: str,
    *,
    outcome: str = Outcome.SUCCESS,
    email: Optional[str] = None,
    target: Optional[Dict[str, Any]] = None,
    **details,
) -> None:
    """Build and enqueue a security event. Never raises into the caller."""
    try:
        actor = extract_actor(request, email=email)
        source = extract_source(request)
        target = dict(target) if target else {}
        if details:
            merged = dict(target.get("details") or {})
            merged.update(details)
            target["details"] = merged
        correlation_id = getattr(request, "security_correlation_id", None)
        event = build_event(
            event_type=event_type,
            outcome=outcome,
            actor=actor,
            source=source,
            target=target,
            app=_build_app_block(request),
            correlation_id=correlation_id,
        )
        get_client(request).enqueue(event)
    except Exception as e:  # noqa - instrumentation must never break a request
        log.warning("security_event_failed", event_type=event_type, error=str(e))


# -- typed convenience wrappers -------------------------------------------

def log_login(request, *, outcome=Outcome.SUCCESS, email=None, **details) -> None:
    log_security_event(request, EventType.LOGIN, outcome=outcome, email=email, **details)


def log_logout(request, *, email=None, **details) -> None:
    log_security_event(request, EventType.LOGOUT, email=email, **details)


def log_registration(request, *, outcome=Outcome.SUCCESS, email=None, **details) -> None:
    log_security_event(request, EventType.REGISTRATION, outcome=outcome, email=email, **details)


def log_restricted_email(request, *, email=None, **details) -> None:
    log_security_event(
        request, EventType.RESTRICTED_EMAIL, outcome=Outcome.FAILURE, email=email, **details
    )


def log_credential_event(request, event_type, *, outcome=Outcome.SUCCESS, target=None, **details) -> None:
    log_security_event(request, event_type, outcome=outcome, target=target, **details)


def log_data_access(request, *, outcome=Outcome.SUCCESS, target=None, **details) -> None:
    log_security_event(request, EventType.DATA_ACCESS, outcome=outcome, target=target, **details)


def log_data_download(request, *, outcome=Outcome.SUCCESS, target=None, **details) -> None:
    log_security_event(request, EventType.DATA_DOWNLOAD, outcome=outcome, target=target, **details)


def log_access_denied(request, *, target=None, reason=None, **details) -> None:
    if reason is not None:
        details["reason"] = reason
    log_security_event(
        request, EventType.ACCESS_DENIED, outcome=Outcome.FAILURE, target=target, **details
    )


def log_data_modification(request, *, outcome=Outcome.SUCCESS, target=None, **details) -> None:
    log_security_event(
        request, EventType.DATA_MODIFICATION, outcome=outcome, target=target, **details
    )
