# Splunk Universal Forwarder (container startup)

The forwarder is the HMS/FISMA compliance log-shipping agent. It runs as the
non-root `nginx` user under `supervisord` (`[program:splunkforwarder]` in
`../supervisord.conf`), started by `run_splunk_forwarder.sh`. The forwarder tree
baked into the image (`/opt/splunkforwarder`) starts **un-licensed** — the Splunk
first-time-run (FTR) marker `$SPLUNK_HOME/ftr` is present — so on each deploy the
wrapper must accept the license non-interactively before splunkd will start.

## Reading the startup logs (CloudWatch)

Everything the wrapper prints is prefixed `[splunk-forwarder]` (its own stage
logging), `[splunk-cli]` (captured, redacted stdout/stderr of a `splunk`
command), or `[splunkd.log]` (tailed lines from splunkd's own log). A healthy
first boot proceeds through these stages, in order:

| Stage | Meaning |
| --- | --- |
| `starting:` + `context:` | announce SPLUNK_HOME, deployment server, effective uid/gid, and ownership/mode/existence of the key paths |
| `stage 'seed-credential'` | first boot only: generate a random admin password into `user-seed.conf` (owner-only mode `-rw-------`); the password is **never** printed |
| `stage 'version'` | first `splunk` call; **accepts the license non-interactively** and records the forwarder version |
| `stage 'config-validate'` | `btool check` validates conf syntax (advisory — a warning does not stop startup) |
| `stage 'status-probe'` / `stage 'start'` | start splunkd if it is not already running |
| `stage 'readiness'` | bounded poll until splunkd reports running (`SPLUNK_FWD_READY_TIMEOUT`, default 120s) |
| `HEALTHY: splunk forwarder started` | **the explicit success line** — splunkd is up and the wrapper is now tailing connection activity |
| `heartbeat:` | emitted every ~`SPLUNK_FWD_HEARTBEAT_EVERY` poll cycles so a quiet-but-alive forwarder is still visible |

Each stage logs its sanitized command intent, exit code, and duration, e.g.
`stage 'start': cmd='splunk start [+license-flags]' exit=0 duration=1s`.

### If it fails

On any startup failure the wrapper logs `FAILED: <what> (exit <code>)`, then a
re-dump of the path/process context and a **bounded, redacted tail of
`splunkd.log`**, and exits non-zero so supervisord restarts it. The two things
to read first: the `FAILED:` line (which command failed and its exit code) and
the `[splunkd.log]` tail (splunkd's own reason). A readiness timeout logs
`splunkd did not reach 'running' within <N>s`.

### The historical two-line hang (root cause fixed here)

A forwarder that emitted only `starting:` and `first boot: seeding …` and then
nothing was hung on Splunk's first-time-run **license prompt**: the previous
wrapper's first `splunk` call was a bare `splunk status` with its output sent to
`/dev/null`, so under supervisord (no TTY, stdin `/dev/null`) it blocked reading
the `y/n` answer, invisibly. Because that hang happened *before* anything cleared
the FTR marker, it recurred on every deploy regardless of volume persistence. The fix: **every** `splunk` invocation now carries
`--accept-license --answer-yes --no-prompt` and reads from `/dev/null`, and the
license is accepted explicitly (the `version` stage) before any status probe. If
you ever see the two-line pattern again, that guarantee has regressed.

## Secrets

The wrapper never prints the generated admin password, and all captured
`[splunk-cli]` / `[splunkd.log]` output passes through a redactor that masks the
value of any `password` / `secret` / `token` / `pass4SymmKey` / `sslPassword` /
`apiKey` key to `<redacted>`. No `set -x`, no environment dumps.

## Tunables (env, with production defaults)

`SPLUNK_FWD_POLL_INTERVAL` (30s), `SPLUNK_FWD_READY_TIMEOUT` (120s),
`SPLUNK_FWD_HEARTBEAT_EVERY` (10 cycles), `SPLUNK_FWD_CLI_TAIL_LINES` (40),
`SPLUNK_FWD_LOG_TAIL_LINES` (50). The tests set the timing knobs low to run fast.

## Tests

`tests/run_forwarder_tests.sh` is a self-contained POSIX-sh harness (no real
Splunk, no network, no AWS): it installs a fake `splunk` CLI keyed on the
missing-license-flags **defect** and drives the real wrapper the way supervisord
does. Run it directly:

```sh
sh deploy/docker/production/splunk/tests/run_forwarder_tests.sh
```

`tests/test_run_splunk_forwarder.py` is the `pytest`/`make test-unit` wrapper
around the same harness. Lint with `shellcheck -s sh`.
