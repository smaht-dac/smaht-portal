# Security-event logging (Splunk HEC)

Structured security-event logging for smaht-portal. Events (logins, credential
operations, data access/downloads, access denials, data modifications) are emitted
as JSON and shipped to a Splunk HTTP Event Collector (HEC) via a non-blocking
background sender.

## Usage

Import the typed helper for the event you are recording and pass the live request:

```python
from encoded.security_logging import log_data_download, Outcome

log_data_download(request, outcome=Outcome.SUCCESS,
                  target={"resource_type": "File", "resource_uuid": str(context.uuid)},
                  filename="x.bam")
```

Available helpers: `log_login`, `log_logout`, `log_registration`,
`log_restricted_email`, `log_credential_event`, `log_data_access`,
`log_data_download`, `log_access_denied`, `log_data_modification`, and the generic
`log_security_event(request, event_type, ...)`.

Every helper is wrapped so a logging failure can never break the request it
instruments. Never pass secrets in `**details` — `build_event` redacts any key that
looks like a secret (`secret`, `token`, `password`, `authorization`, `jwt`,
`credential`) and request headers are sanitized, but call sites should avoid passing
sensitive values in the first place.

## Configuration

| Setting (ini)        | Env / GAC fallback           | Default          |
|----------------------|------------------------------|------------------|
| `splunk.enabled`     | —                            | `false`          |
| `splunk.hec_url`     | `SPLUNK_HEC_URL` / `SplunkHecUrl` | (none)      |
| `splunk.hec_token`   | `SPLUNK_HEC_TOKEN` / `SplunkHecToken` | (none)  |
| `splunk.source`      | —                            | `smaht-portal`   |
| `splunk.sourcetype`  | —                            | `smaht:security` |
| `splunk.index`       | —                            | (HEC default)    |

The client only ships to Splunk when `splunk.enabled` is true **and** both a URL and
token are resolved; otherwise it degrades to structlog-only mode (events still appear
in the JSON stdout logs). Dev and test default to disabled.

### GAC / Secrets Manager

In deployed environments the token (and optionally the URL) are pulled from the
Global Application Configuration via `assume_identity()` (the same mechanism as
`GA4_API_SECRET`). Add to the GAC:

- **`SPLUNK_HEC_TOKEN`** — the HEC token (required to enable shipping).
- **`SPLUNK_HEC_URL`** — the HEC collector URL (alternatively set `splunk.hec_url` in
  the ini).

To enable in production, set `splunk.enabled = true` and provide `SPLUNK_HEC_TOKEN`
(+ URL) in the GAC.

## Transport behavior

- **Non-blocking:** `enqueue()` never blocks the request thread; a full queue drops
  events and emits one throttled warning.
- **Batched:** events are accumulated up to `batch_max_events` / `batch_max_seconds`
  and POSTed together.
- **Fork-safe:** the worker thread starts lazily per process, so each gunicorn worker
  gets its own thread/queue.
- **Graceful degradation:** on persistent HEC failure the batch is dropped and a
  single structlog warning is emitted — the application is never affected.
