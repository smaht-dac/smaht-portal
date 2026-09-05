# Splunk Universal Forwarder — ECS sidecar

The forwarder is the HMS/FISMA compliance log-shipping agent. It runs in **its
own ECS sidecar container** (this directory builds that image), mirroring the
CrowdStrike Falcon sensor sidecar. It is **not** part of the application image
anymore — that in-app-container design was rolled back on this branch because
configuring/running the agent from inside the app's Fargate container proved
unworkable in the deployed evidence.

```
ECS task
├─ app container            writes app logs -> /var/log/smaht  (shared volume)
├─ splunk sidecar (THIS)    reads  /var/log/smaht (ro) -> ships to HMS indexers
└─ crowdstrike sidecar      (vendor image; not built in this repo)
```

The forwarder tree baked into the image (`/opt/splunkforwarder`) starts
**un-licensed** — the Splunk first-time-run (FTR) marker `$SPLUNK_HOME/ftr` is
present — and the sidecar has no persistent Splunk volume, so **every** boot is a
first-time run and the entrypoint must accept the license non-interactively
before splunkd will start.

## Files

| File | Role |
| --- | --- |
| `Dockerfile` | Builds the sidecar image: installs the forwarder, creates the non-root `splunkfwd` user, installs the config + entrypoint. |
| `entrypoint.sh` | Container PID 1. Seeds a first-boot admin credential, accepts the license, starts splunkd, readiness-checks it, then tails connection activity and ties the container lifetime to splunkd. |
| `deploymentclient.conf` | `deploy-poll` target: the HMS deployment server that pushes the outputs/index config after phone-home. |
| `inputs.conf` | File monitors over the **shared volume** mount paths. |
| `tests/` | Self-contained regression suite (no real Splunk / network / AWS). |

## Build

```sh
docker build -f deploy/docker/splunk/Dockerfile deploy/docker/splunk
# offline/local base override:
docker build --build-arg BASE_IMAGE=debian:bookworm-slim -f deploy/docker/splunk/Dockerfile deploy/docker/splunk
```

`buildspec.yml` contains a commented block showing how to build + push this image
to ECR alongside the app image; enable it once the sidecar ECR repository exists.

## Reading the startup logs (CloudWatch)

Everything the entrypoint prints is prefixed `[splunk-forwarder]` (its own stage
logging), `[splunk-cli]` (captured, redacted stdout/stderr of a `splunk`
command), or `[splunkd.log]` (tailed lines from splunkd's own log). A healthy
boot proceeds through these stages, in order:

| Stage | Meaning |
| --- | --- |
| `starting:` + `context:` | announce SPLUNK_HOME, deployment server, effective uid/gid, and ownership/mode/existence of the key paths |
| `stage 'seed-credential'` | first boot only: generate a random admin password into `user-seed.conf` (owner-only mode `-rw-------`); the password is **never** printed |
| `stage 'version'` | first `splunk` call; **accepts the license non-interactively** and records the forwarder version |
| `stage 'config-validate'` | `btool check` validates conf syntax (advisory — a warning does not stop startup) |
| `stage 'status-probe'` / `stage 'start'` | start splunkd if it is not already running |
| `stage 'readiness'` | bounded poll until splunkd reports running (`SPLUNK_FWD_READY_TIMEOUT`, default 120s) |
| `HEALTHY: splunk forwarder started` | **the explicit success line** — splunkd is up and the entrypoint is now tailing connection activity |
| `heartbeat:` | emitted every ~`SPLUNK_FWD_HEARTBEAT_EVERY` poll cycles so a quiet-but-alive forwarder is still visible |

Each stage logs its sanitized command intent, exit code, and duration, e.g.
`stage 'start': cmd='splunk start [+license-flags]' exit=0 duration=1s`.

### If it fails

On any startup failure the entrypoint logs `FAILED: <what> (exit <code>)`, then a
re-dump of the path/process context and a **bounded, redacted tail of
`splunkd.log`**, and exits non-zero so the sidecar container exits and ECS
restarts it. Read the `FAILED:` line (which command failed and its exit code)
and the `[splunkd.log]` tail (splunkd's own reason) first. A readiness timeout
logs `splunkd did not reach 'running' within <N>s`.

### The historical two-line hang (root cause, fixed in PR #729 and preserved here)

A forwarder that emitted only `starting:` and `first boot: seeding …` and then
nothing was hung on Splunk's first-time-run **license prompt**: the original
in-app-container wrapper's first `splunk` call was a bare `splunk status` with its
output sent to `/dev/null`, so with no TTY and stdin `/dev/null` it blocked
reading the `y/n` answer, invisibly. The fix — preserved in `entrypoint.sh`
because it is a Splunk property independent of sidecar-vs-in-app — is that
**every** `splunk` invocation carries `--accept-license --answer-yes
--no-prompt` and reads from `/dev/null`, and the license is accepted explicitly
(the `version` stage) before any status probe. If you ever see the two-line
pattern again, that guarantee has regressed.

## Secrets

The entrypoint never prints the generated admin password, and all captured
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
missing-license-flags **defect** and drives the real `entrypoint.sh` the way the
sidecar runs it. Run it directly:

```sh
sh deploy/docker/splunk/tests/run_forwarder_tests.sh
```

`tests/test_run_splunk_forwarder.py` is the `pytest` / `make test-unit` wrapper
around the same harness. Lint the shell with `shellcheck -s sh`.

## ECS task-definition handoff (NOT owned by this repository)

This repo owns the sidecar **image and its config/entrypoint**. It does **not**
contain the ECS task definition, the shared-volume declaration, the container
restart policy, or the load-balancer wiring — those live in the
infrastructure/CloudFormation project that provisions the SMaHT ECS service (the
same place the CrowdStrike sidecar and the `FALCON_*` / `FALCON_ECR` values
referenced in `buildspec.yml` are defined). What this repo CAN validate is marked
below; the rest is the exact, complete contract the task-definition owner must add.

### What this repo already guarantees (validated in-repo)

- The sidecar entrypoint accepts the license non-interactively, starts/readiness-
  checks splunkd, exits non-zero on failure, and does a **bounded** graceful
  `splunk stop` on SIGTERM (`tests/run_forwarder_tests.sh`, 41 cases).
- The app image writes app worker logs **and** nginx access/error logs into one
  `/var/log/smaht` tree, owned by the non-root `nginx` user, and declares it a
  `VOLUME` so a mount preserves that ownership (`Dockerfile`, guarded by
  `deploy/docker/production/tests/test_container_contracts.py`).

### What the task definition MUST add (external, not validated here)

1. **A shared log volume** (e.g. a Fargate ephemeral volume named `smaht-logs`),
   mounted:
   - into the **app** container **read-write** at `/var/log/smaht`;
   - into the **splunk sidecar** **read-only** at `/var/log/smaht`.

   **Ownership/mode contract (B2 — this is the sharp edge).** An ECS bind/managed
   mount defaults to owner `root:root`, mode `0755`, which would MASK the image's
   nginx-owned directory and stop the non-root app (uid **121**) from creating
   `/var/log/smaht/*.log`. The app image declares `VOLUME ["/var/log/smaht"]` so
   the mount **preserves** the image path's ownership; confirm on the target
   platform that:
   - the app container runs as uid/gid **121** (`nginx`) and can create/rotate
     `/var/log/smaht/smahtN.log` and `/var/log/smaht/nginx/{access,error}.log`;
   - the sidecar runs as uid/gid **4321** (`splunkfwd`) and can **read** them.
     Dirs are `0755` and the app/nginx log files are world-readable, so uid 4321
     reads them via `other`. If your platform ignores the `VOLUME` ownership hint
     (some managed volume drivers do), add a **root init container** that
     `chown 121:121 /var/log/smaht -R && chmod 0755 /var/log/smaht /var/log/smaht/nginx`
     with `dependsOn: { app: START }` ordering, OR give both containers a shared
     supplementary gid and make the logs group-readable.
   - **Mount order:** the app must mount RW and start writing before/independently
     of the sidecar; the sidecar only reads.

2. **The sidecar container definition** referencing the image this repo builds,
   with:
   - `essential: false` — a forwarder crash must never take the app task down; **and**
   - **`restartPolicy` with `enabled: true` (B1).** `essential: false` alone does
     NOT restart a crashed container — ECS just leaves it stopped for the task's
     lifetime, silently ending log shipping. The entrypoint deliberately exits
     non-zero on failure expecting a restart, so the policy is REQUIRED, e.g.:
     ```
     restartPolicy: { enabled: true, restartAttemptPeriod: 60 }
     ```
     (Container restart policies are a per-container opt-in; see the AWS
     "Restart individual containers in Amazon ECS tasks" doc. Do not set
     `ignoredExitCodes` for 143 — a clean SIGTERM shutdown on task drain does not
     loop because the whole task is stopping.)
   - `dependsOn: { containerName: <app>, condition: START }` so it starts after the
     app begins writing.

3. **Egress to the HMS deployment server** `10.124.5.202:8089` from the task's
   security group / network path (the sidecar phones home there).

4. **A `stopTimeout`** strictly greater than the sidecar's `SPLUNK_FWD_STOP_TIMEOUT`
   (default 20s) so the bounded graceful `splunk stop` completes before ECS
   SIGKILLs the container — 30s is ample.

5. **A log configuration** (`awslogs` / CloudWatch) on the sidecar so the
   `[splunk-forwarder]` / `[splunk-cli]` / `[splunkd.log]` output is captured.

Until that task-definition change lands, this image builds and passes its tests
but is not yet wired into the running task. The top-level PR spells out this
handoff explicitly.

## Building/validating the sidecar image (proportionate, Docker-gated)

`tests/smoke_test.sh` builds the sidecar image and runs it end-to-end (uid/gid,
`splunk version`, start/readiness, TERM/stop, no raw secrets in output). It needs
a Docker daemon and network access to `download.splunk.com`, so it is **not** part
of the unit-test stack and was **not runnable in this environment** (no Docker
daemon). Run it before a first deployment:

```sh
sh deploy/docker/splunk/tests/smoke_test.sh
```
