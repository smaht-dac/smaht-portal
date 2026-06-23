"""Per-site emission tests for security logging.

These exercise the instrumentation added to the view functions directly (no DB/ES),
by injecting a fake HEC client onto the request registry and monkeypatching the
snovault delegate functions the views wrap.
"""
import pytest
from pyramid.httpexceptions import HTTPForbidden

from ..security_logging.api import SECURITY_LOGGER_REGISTRY_KEY
from ..security_logging.events import EventType, Outcome

pytestmark = [pytest.mark.unit, pytest.mark.working]


@pytest.fixture(autouse=True)
def autouse_external_tx():
    """Override the package-level DB-transaction autouse fixture; pure unit tests."""
    yield


class FakeClient:
    enabled = True

    def __init__(self):
        self.events = []

    def enqueue(self, event):
        self.events.append(event)


class FakeRegistry(dict):
    settings = {"snovault.app_version": "1.0", "env.name": "test"}


class FakeRequest:
    def __init__(self, method="GET", principals=None, matchdict=None):
        self.method = method
        self.effective_principals = principals or ["userid.u1"]
        self.remote_addr = "10.0.0.1"
        self.user_agent = "pytest"
        self.path_info = "/p"
        self.headers = {"Authorization": "Bearer secret", "User-Agent": "pytest"}
        self.registry = FakeRegistry()
        self.security_correlation_id = "corr"
        self.matchdict = matchdict or {}
        self.client = FakeClient()
        self.registry[SECURITY_LOGGER_REGISTRY_KEY] = self.client


class FakeTypeInfo:
    name = "SomeType"


class FakeContext:
    uuid = "ctx-uuid"
    type_info = FakeTypeInfo()
    properties = {"status": "released"}

    def jsonld_id(self, request):
        return "/some-type/ctx-uuid/"


def _events_of(request, event_type):
    return [e for e in request.client.events if e["event_type"] == event_type]


# -- access keys ----------------------------------------------------------

def test_access_key_add_emits_credential_create(monkeypatch):
    from ..types import access_key as ak
    monkeypatch.setattr(ak, "sno_access_key_add",
                        lambda c, r: {"@graph": [{"access_key_id": "AKIA1"}]})
    req = FakeRequest(method="POST")
    ak.access_key_add(FakeContext(), req)
    events = _events_of(req, EventType.CREDENTIAL_CREATE)
    assert len(events) == 1
    assert events[0]["outcome"] == Outcome.SUCCESS
    assert events[0]["target"]["details"]["access_key_id"] == "AKIA1"


def test_access_key_add_emits_failure_on_error(monkeypatch):
    from ..types import access_key as ak

    def boom(c, r):
        raise ValueError("nope")

    monkeypatch.setattr(ak, "sno_access_key_add", boom)
    req = FakeRequest(method="POST")
    with pytest.raises(ValueError):
        ak.access_key_add(FakeContext(), req)
    events = _events_of(req, EventType.CREDENTIAL_CREATE)
    assert len(events) == 1
    assert events[0]["outcome"] == Outcome.FAILURE


def test_access_key_reset_emits_credential_reset(monkeypatch):
    from ..types import access_key as ak
    monkeypatch.setattr(ak, "sno_access_key_reset_secret", lambda c, r: {"status": "ok"})
    req = FakeRequest(method="POST")
    ak.access_key_reset_secret(FakeContext(), req)
    events = _events_of(req, EventType.CREDENTIAL_RESET)
    assert len(events) == 1
    assert events[0]["target"]["resource_uuid"] == "ctx-uuid"


def test_access_key_view_raw_emits_event(monkeypatch):
    from ..types import access_key as ak
    monkeypatch.setattr(ak, "sno_access_key_view_raw", lambda c, r: {"secret_access_key": "x"})
    req = FakeRequest()
    ak.access_key_view_raw(FakeContext(), req)
    assert len(_events_of(req, EventType.CREDENTIAL_VIEW_RAW)) == 1


# -- data modification ----------------------------------------------------

def test_collection_add_emits_data_modification(monkeypatch):
    from ..types import base
    monkeypatch.setattr(base, "sno_collection_add",
                        lambda c, r, render: {"@graph": [{"uuid": "new-uuid"}]})
    req = FakeRequest(method="POST")
    base.collection_add(FakeContext(), req, render=None)
    events = _events_of(req, EventType.DATA_MODIFICATION)
    assert len(events) == 1
    assert events[0]["target"]["resource_uuid"] == "new-uuid"
    assert events[0]["target"]["details"]["operation"] == "create"


def test_item_edit_emits_modification_for_put(monkeypatch):
    from ..types import base
    monkeypatch.setattr(base, "sno_item_edit", lambda c, r, render: {"status": "ok"})
    req = FakeRequest(method="PUT")
    base.item_edit(FakeContext(), req, render=None)
    events = _events_of(req, EventType.DATA_MODIFICATION)
    assert len(events) == 1
    assert events[0]["target"]["details"]["operation"] == "edit"


def test_item_edit_skips_logging_for_check_only_get(monkeypatch):
    from ..types import base
    monkeypatch.setattr(base, "sno_item_edit", lambda c, r, render: {"status": "ok"})
    req = FakeRequest(method="GET")
    base.item_edit(FakeContext(), req, render=None)
    assert _events_of(req, EventType.DATA_MODIFICATION) == []


# -- ingestion status -----------------------------------------------------

def test_ingestion_status_non_admin_emits_access_denied(monkeypatch):
    from ..ingestion import ingestion_status as ist
    monkeypatch.setattr(ist, "is_admin_request", lambda r: False)
    req = FakeRequest(matchdict={"submission_uuid": "info"})
    with pytest.raises(HTTPForbidden):
        ist.ingestion_status(FakeContext(), req)
    events = _events_of(req, EventType.ACCESS_DENIED)
    assert len(events) == 1
    assert "restricted" in events[0]["target"]["details"]["reason"]


# -- file download_cli ----------------------------------------------------

def test_download_cli_protected_emits_access_denied(monkeypatch):
    from ..types import file as file_mod
    monkeypatch.setattr(file_mod, "validate_user_has_protected_access", lambda r: False)
    ctx = FakeContext()
    ctx.properties = {"status": "protected-network"}
    req = FakeRequest()
    with pytest.raises(HTTPForbidden):
        file_mod.download_cli(ctx, req)
    assert len(_events_of(req, EventType.ACCESS_DENIED)) == 1


def test_download_cli_success_emits_data_access(monkeypatch):
    from ..types import file as file_mod
    monkeypatch.setattr(file_mod, "CoreDownloadCli", lambda c, r: {"download_credentials": {}})
    ctx = FakeContext()
    ctx.properties = {"status": "released"}
    req = FakeRequest()
    file_mod.download_cli(ctx, req)
    events = _events_of(req, EventType.DATA_ACCESS)
    assert len(events) == 1
    assert events[0]["outcome"] == Outcome.SUCCESS
