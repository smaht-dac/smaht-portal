"""Security-event logging for smaht-portal.

Public API for emitting structured security events (logins, credential operations,
data access/downloads, access denials, data modifications) that are shipped to
Splunk via a non-blocking HEC client. See ``api`` for the helper functions and
``hec_client`` for the transport.
"""
import uuid

from .api import (  # noqa - re-exported public API
    SECURITY_LOGGER_REGISTRY_KEY,
    get_client,
    log_security_event,
    log_login,
    log_logout,
    log_registration,
    log_restricted_email,
    log_credential_event,
    log_data_access,
    log_data_download,
    log_access_denied,
    log_data_modification,
)
from .events import EventType, Outcome, build_event  # noqa
from .hec_client import SplunkHECClient  # noqa


def security_logging_tween_factory(handler, registry):
    """Attach a per-request correlation id used to tie security events together.

    Reuses an incoming ``X-Request-Id`` header when present so events can be
    correlated with upstream proxies/load balancers.
    """
    def tween(request):
        request.security_correlation_id = (
            request.headers.get("X-Request-Id") or str(uuid.uuid4())
        )
        return handler(request)

    return tween


def includeme(config):
    config.add_tween("encoded.security_logging.security_logging_tween_factory")
