import json
import threading
from unittest import mock

import pytest

from ..security_logging.hec_client import SplunkHECClient, _SHUTDOWN

pytestmark = [pytest.mark.unit, pytest.mark.working]


@pytest.fixture(autouse=True)
def autouse_external_tx():
    """Override the package-level DB-transaction autouse fixture; these are pure
    unit tests that need no database."""
    yield


def _client(**kwargs):
    defaults = dict(hec_url="https://hec.example/services/collector",
                    token="tok", enabled=True)
    defaults.update(kwargs)
    return SplunkHECClient(**defaults)


def test_disabled_when_unconfigured():
    # enabled=True but no url/token => effectively disabled
    c = SplunkHECClient(enabled=True)
    assert c.enabled is False


def test_disabled_mode_routes_to_structlog_no_thread():
    c = SplunkHECClient(enabled=False)
    with mock.patch.object(c, "_ensure_worker") as ensure:
        c.enqueue({"event_type": "login"})
    ensure.assert_not_called()
    assert c._worker is None


def test_serialize_batch_includes_envelope_and_index():
    c = _client(index="security", source="src", sourcetype="st")
    payload = c._serialize_batch([{"a": 1}, {"b": 2}])
    lines = payload.split("\n")
    assert len(lines) == 2
    first = json.loads(lines[0])
    assert first["event"] == {"a": 1}
    assert first["source"] == "src"
    assert first["sourcetype"] == "st"
    assert first["index"] == "security"


def test_post_batch_success_no_retry():
    c = _client(max_retries=3)
    session = mock.Mock()
    session.post.return_value = mock.Mock(status_code=200, text="ok")
    with mock.patch("time.sleep") as sleep:
        c._post_batch(session, [{"x": 1}])
    assert session.post.call_count == 1
    sleep.assert_not_called()


def test_post_batch_retries_then_gives_up():
    c = _client(max_retries=3, retry_backoff_seconds=0.1)
    session = mock.Mock()
    session.post.return_value = mock.Mock(status_code=503, text="busy")
    with mock.patch("time.sleep") as sleep, \
         mock.patch("encoded.security_logging.hec_client.log") as log:
        c._post_batch(session, [{"x": 1}])  # must not raise
    assert session.post.call_count == 3
    assert sleep.call_count == 3
    log.warning.assert_called_once()


def test_post_batch_recovers_after_transient_error():
    c = _client(max_retries=3)
    session = mock.Mock()
    session.post.side_effect = [Exception("boom"),
                                mock.Mock(status_code=200, text="ok")]
    with mock.patch("time.sleep"):
        c._post_batch(session, [{"x": 1}])
    assert session.post.call_count == 2


def test_enqueue_non_blocking_when_queue_full():
    c = _client(queue_max_size=1)
    # Force the worker/queue to exist but never drain.
    c._ensure_worker = lambda: None  # type: ignore
    import queue as _q
    c._queue = _q.Queue(maxsize=1)
    c._queue.put_nowait({"first": True})  # fill it
    with mock.patch("encoded.security_logging.hec_client.log") as log:
        c.enqueue({"second": True})  # must not block or raise
        c.enqueue({"third": True})
    assert c._dropped == 2
    # Only one warning despite two drops (throttled).
    log.warning.assert_called_once()


def test_collect_batch_respects_max_events():
    c = _client(batch_max_events=2, batch_max_seconds=100)
    c._ensure_worker = lambda: None  # type: ignore
    import queue as _q
    c._queue = _q.Queue()
    for i in range(5):
        c._queue.put_nowait({"i": i})
    batch, shutdown = c._collect_batch()
    assert len(batch) == 2
    assert shutdown is False


def test_collect_batch_stops_on_shutdown_sentinel():
    c = _client(batch_max_events=10, batch_max_seconds=100)
    c._ensure_worker = lambda: None  # type: ignore
    import queue as _q
    c._queue = _q.Queue()
    c._queue.put_nowait({"i": 0})
    c._queue.put_nowait(_SHUTDOWN)
    batch, shutdown = c._collect_batch()
    assert batch == [{"i": 0}]
    assert shutdown is True


def test_end_to_end_threaded_send_and_close():
    c = _client(batch_max_events=10, batch_max_seconds=0.1)
    posted = []
    done = threading.Event()

    def fake_post(url, data=None, headers=None, timeout=None, verify=None):
        posted.append(data)
        done.set()
        return mock.Mock(status_code=200, text="ok")

    with mock.patch("encoded.security_logging.hec_client.requests.Session") as Session:
        Session.return_value.post.side_effect = fake_post
        c.enqueue({"event_type": "data_download"})
        assert done.wait(timeout=5), "worker never POSTed"
        c.close(timeout=5)
    assert len(posted) == 1
    envelope = json.loads(posted[0])
    assert envelope["event"]["event_type"] == "data_download"


def test_fork_safety_restarts_worker_on_pid_change():
    c = _client()
    with mock.patch("encoded.security_logging.hec_client.requests.Session"):
        c._ensure_worker()
        first_worker = c._worker
        first_queue = c._queue
        assert first_worker is not None
        # Simulate a fork: the stored pid no longer matches.
        c._pid = -1
        c._ensure_worker()
        assert c._worker is not first_worker
        assert c._queue is not first_queue
        c.close(timeout=5)
