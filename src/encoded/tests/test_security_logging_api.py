import pytest

from ..security_logging import api as sec_api
from ..security_logging.api import (
    SECURITY_LOGGER_REGISTRY_KEY,
    get_client,
    log_data_download,
    log_login,
)
from ..security_logging.context import extract_actor, extract_source
from ..security_logging.events import EventType, Outcome

pytestmark = [pytest.mark.unit, pytest.mark.working]


@pytest.fixture(autouse=True)
def autouse_external_tx():
    """Override the package-level DB-transaction autouse fixture; pure unit tests."""
    yield


class FakeClient:
    """Stand-in HEC client that records enqueued events."""
    enabled = True

    def __init__(self):
        self.events = []

    def enqueue(self, event):
        self.events.append(event)


class _FakeRegistry(dict):
    settings = {"snovault.app_version": "1.0", "env.name": "test"}


class _FakeRequest:
    """Minimal request stand-in for the security-logging helpers."""

    def __init__(self, principals=None, headers=None):
        self.effective_principals = principals or []
        self.remote_addr = "10.0.0.1"
        self.user_agent = "pytest"
        self.path_info = "/some/path"
        self.method = "GET"
        self.headers = headers if headers is not None else {}
        self.registry = _FakeRegistry()
        self.security_correlation_id = None


def _request(principals=None, headers=None):
    return _FakeRequest(principals=principals, headers=headers)


def test_extract_actor_anonymous_never_raises():
    actor = extract_actor(_request(principals=[]))
    assert actor["user_uuid"] is None
    assert actor["auth_method"] == "anonymous"


def test_extract_actor_auth0_user():
    actor = extract_actor(_request(principals=["userid.abc-123", "group.admin"]))
    assert actor["user_uuid"] == "abc-123"
    assert actor["auth_method"] == "auth0"
    assert "group.admin" in actor["principals"]


def test_extract_actor_accesskey_auth_method():
    actor = extract_actor(_request(principals=["userid.abc", "accesskey.KEY"]))
    assert actor["auth_method"] == "accesskey"


def test_extract_actor_accepts_email_override():
    actor = extract_actor(_request(), email="user@example.org")
    assert actor["email"] == "user@example.org"


def test_extract_source_basic():
    src = extract_source(_request(headers={"User-Agent": "x"}))
    assert src["remote_ip"] == "10.0.0.1"
    assert src["request_path"] == "/some/path"
    assert src["request_method"] == "GET"


def test_get_client_falls_back_when_missing():
    # DummyRequest registry has no security client registered
    assert get_client(_request()) is sec_api._FALLBACK_CLIENT


def test_log_login_enqueues_event_via_registry_client():
    req = _request(principals=["userid.u9"])
    fake = FakeClient()
    req.registry[SECURITY_LOGGER_REGISTRY_KEY] = fake
    req.security_correlation_id = "corr-1"
    log_login(req, outcome=Outcome.SUCCESS, email="a@b.org")
    assert len(fake.events) == 1
    ev = fake.events[0]
    assert ev["event_type"] == EventType.LOGIN
    assert ev["outcome"] == Outcome.SUCCESS
    assert ev["actor"]["email"] == "a@b.org"
    assert ev["correlation_id"] == "corr-1"


def test_log_data_download_merges_details_into_target():
    req = _request(principals=["userid.u9"])
    fake = FakeClient()
    req.registry[SECURITY_LOGGER_REGISTRY_KEY] = fake
    log_data_download(req, outcome=Outcome.SUCCESS,
                      target={"resource_uuid": "f1"}, filename="x.bam")
    ev = fake.events[0]
    assert ev["event_type"] == EventType.DATA_DOWNLOAD
    assert ev["target"]["resource_uuid"] == "f1"
    assert ev["target"]["details"]["filename"] == "x.bam"


def test_log_call_never_raises_even_if_client_broken():
    req = _request()

    class Boom:
        enabled = True

        def enqueue(self, event):
            raise RuntimeError("nope")

    req.registry[SECURITY_LOGGER_REGISTRY_KEY] = Boom()
    # Should swallow the error and not propagate.
    log_login(req, outcome=Outcome.FAILURE)
