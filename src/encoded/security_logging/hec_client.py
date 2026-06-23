"""Non-blocking, fork-safe Splunk HTTP Event Collector (HEC) client.

Events are enqueued from request threads (never blocking) and shipped in batches by
a background daemon worker thread. The worker is started lazily on first use and is
tied to the process that started it, so a gunicorn pre-fork worker gets its own
thread/queue automatically. On persistent HEC failure the client degrades
gracefully: it drops events and emits a single structlog warning rather than
raising into the application.
"""
import atexit
import json
import os
import queue
import threading
import time
from typing import Any, Dict, List, Optional

import requests
from structlog import getLogger

log = getLogger(__name__)


# Sentinel pushed onto the queue to tell the worker to flush and stop.
_SHUTDOWN = object()


class SplunkHECClient:
    """Buffers security events and ships them to a Splunk HEC endpoint."""

    def __init__(
        self,
        *,
        hec_url: Optional[str] = None,
        token: Optional[str] = None,
        source: str = "smaht-portal",
        sourcetype: str = "smaht:security",
        index: Optional[str] = None,
        enabled: bool = True,
        batch_max_events: int = 50,
        batch_max_seconds: float = 5.0,
        queue_max_size: int = 10000,
        http_timeout: float = 5.0,
        max_retries: int = 3,
        retry_backoff_seconds: float = 0.5,
        verify_tls: bool = True,
    ):
        self.hec_url = hec_url
        self.token = token
        self.source = source
        self.sourcetype = sourcetype
        self.index = index
        # If we have no place to send events, force disabled (structlog-only) mode.
        self.enabled = bool(enabled and hec_url and token)
        self.batch_max_events = batch_max_events
        self.batch_max_seconds = batch_max_seconds
        self.http_timeout = http_timeout
        self.max_retries = max_retries
        self.retry_backoff_seconds = retry_backoff_seconds
        self.verify_tls = verify_tls

        self._queue_max_size = queue_max_size
        self._queue: Optional[queue.Queue] = None
        self._worker: Optional[threading.Thread] = None
        self._pid: Optional[int] = None
        self._lock = threading.Lock()
        self._dropped = 0
        self._warned_full = False

    # -- producer side (called from request threads) ----------------------

    def enqueue(self, event: Dict[str, Any]) -> None:
        """Queue an event for delivery. Never blocks; never raises."""
        if not self.enabled:
            # Disabled / unconfigured: emit to structlog so the event is still
            # captured in stdout JSON logs (dev/test default).
            log.info("security_event", **event)
            return
        try:
            self._ensure_worker()
            self._queue.put_nowait(event)
        except queue.Full:
            self._dropped += 1
            if not self._warned_full:
                self._warned_full = True
                log.warning("splunk_hec_queue_full", dropped=self._dropped)
        except Exception as e:  # noqa - logging must never break a request
            log.warning("splunk_hec_enqueue_error", error=str(e))

    def _ensure_worker(self) -> None:
        """Start the worker thread lazily, restarting it if the process forked."""
        if self._worker is not None and self._pid == os.getpid() and self._worker.is_alive():
            return
        with self._lock:
            current_pid = os.getpid()
            if self._worker is not None and self._pid == current_pid and self._worker.is_alive():
                return
            # Either first use, or the process forked (gunicorn worker) and we
            # inherited a dead thread reference. Build a fresh queue + thread.
            self._queue = queue.Queue(maxsize=self._queue_max_size)
            self._pid = current_pid
            self._dropped = 0
            self._warned_full = False
            self._worker = threading.Thread(
                target=self._run, name="splunk-hec-worker", daemon=True
            )
            self._worker.start()
            atexit.register(self.close)

    # -- consumer side (background worker thread) -------------------------

    def _run(self) -> None:
        session = requests.Session()
        while True:
            batch, shutdown = self._collect_batch()
            if batch:
                self._post_batch(session, batch)
            if shutdown:
                break

    def _collect_batch(self):
        """Block for the first event, then accumulate up to the batch limits.

        Returns ``(batch, shutdown)`` where ``shutdown`` indicates the sentinel
        was seen and the worker should stop after posting this batch.
        """
        batch: List[Dict[str, Any]] = []
        try:
            first = self._queue.get()
        except Exception:  # noqa
            return batch, False
        if first is _SHUTDOWN:
            return batch, True
        batch.append(first)
        deadline = time.monotonic() + self.batch_max_seconds
        while len(batch) < self.batch_max_events:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                item = self._queue.get(timeout=remaining)
            except queue.Empty:
                break
            if item is _SHUTDOWN:
                return batch, True
            batch.append(item)
        return batch, False

    def _serialize_batch(self, events: List[Dict[str, Any]]) -> str:
        """Build the newline-delimited HEC payload for a batch of events."""
        lines = []
        for event in events:
            envelope = {
                "event": event,
                "source": self.source,
                "sourcetype": self.sourcetype,
            }
            if self.index:
                envelope["index"] = self.index
            lines.append(json.dumps(envelope, default=str))
        return "\n".join(lines)

    def _post_batch(self, session: requests.Session, events: List[Dict[str, Any]]) -> None:
        payload = self._serialize_batch(events)
        headers = {
            "Authorization": f"Splunk {self.token}",
            "Content-Type": "application/json",
        }
        last_error = None
        for attempt in range(self.max_retries):
            try:
                resp = session.post(
                    self.hec_url,
                    data=payload,
                    headers=headers,
                    timeout=self.http_timeout,
                    verify=self.verify_tls,
                )
                if 200 <= resp.status_code < 300:
                    return
                last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
            except Exception as e:  # noqa
                last_error = str(e)
            time.sleep(self.retry_backoff_seconds * (2 ** attempt))
        # Persistent failure: drop the batch but record it.
        log.warning(
            "splunk_hec_post_failed", count=len(events), error=last_error
        )

    # -- shutdown ---------------------------------------------------------

    def close(self, timeout: float = 5.0) -> None:
        """Flush and stop the worker thread. Best-effort; never raises."""
        worker = self._worker
        if worker is None or not worker.is_alive() or self._pid != os.getpid():
            return
        try:
            self._queue.put_nowait(_SHUTDOWN)
        except Exception:  # noqa
            return
        worker.join(timeout=timeout)
