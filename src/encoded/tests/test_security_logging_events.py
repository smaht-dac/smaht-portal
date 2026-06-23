import datetime

import pytest

from ..security_logging.context import sanitize_headers, REDACTED
from ..security_logging.events import EventType, Outcome, build_event

pytestmark = [pytest.mark.unit, pytest.mark.working]


@pytest.fixture(autouse=True)
def autouse_external_tx():
    """Override the package-level DB-transaction autouse fixture; pure unit tests."""
    yield


def test_build_event_shape_and_timestamp():
    ev = build_event(
        event_type=EventType.DATA_DOWNLOAD,
        outcome=Outcome.SUCCESS,
        actor={"user_uuid": "u1"},
        source={"remote_ip": "1.2.3.4"},
        target={"resource_uuid": "f1"},
        app={"version": "1.0"},
        correlation_id="cid",
    )
    assert ev["event_type"] == "data_download"
    assert ev["outcome"] == "success"
    assert ev["actor"]["user_uuid"] == "u1"
    assert ev["source"]["remote_ip"] == "1.2.3.4"
    assert ev["correlation_id"] == "cid"
    # timestamp parses as ISO-8601 and is timezone-aware UTC
    parsed = datetime.datetime.fromisoformat(ev["timestamp"])
    assert parsed.tzinfo is not None


def test_build_event_defaults_empty_blocks():
    ev = build_event(event_type=EventType.LOGIN)
    assert ev["outcome"] == Outcome.SUCCESS
    assert ev["actor"] == {}
    assert ev["target"] == {}
    assert ev["correlation_id"] is None


def test_build_event_scrubs_secret_keys_recursively():
    ev = build_event(
        event_type=EventType.CREDENTIAL_CREATE,
        target={"details": {
            "access_key_id": "AKIA",
            "secret_access_key": "shh",
            "nested": {"jwt": "x.y.z", "password": "p", "ok": "keep"},
        }},
    )
    details = ev["target"]["details"]
    assert details["access_key_id"] == "AKIA"
    assert details["secret_access_key"] == "<redacted>"
    assert details["nested"]["jwt"] == "<redacted>"
    assert details["nested"]["password"] == "<redacted>"
    assert details["nested"]["ok"] == "keep"


def test_sanitize_headers_redacts_sensitive():
    headers = {
        "Authorization": "Bearer eyJ...",
        "Cookie": "session=abc",
        "User-Agent": "curl/8",
        "X-Auth-Token": "tok",
    }
    sanitized = sanitize_headers(headers)
    assert sanitized["Authorization"] == REDACTED
    assert sanitized["Cookie"] == REDACTED
    assert sanitized["X-Auth-Token"] == REDACTED
    assert sanitized["User-Agent"] == "curl/8"
