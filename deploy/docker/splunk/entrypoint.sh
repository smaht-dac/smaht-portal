#!/bin/sh
# Entry point (PID 1) of the Splunk Universal Forwarder ECS sidecar container.
#
# ARCHITECTURE: the forwarder runs in its OWN sidecar container (mirroring the
# CrowdStrike Falcon sensor sidecar), NOT inside the application container. It
# reads the application/web logs off a read-only SHARED VOLUME that the app
# container writes (see inputs.conf) and phones home to the HMS deployment
# server (deploymentclient.conf). It runs as the container's non-root
# `splunkfwd` user - satisfying the HMS doc's "do NOT run as root" requirement -
# and replaces the doc's systemd boot-start with plain container lifecycle: this
# script is the container's foreground process, so when splunkd goes away we
# exit non-zero and ECS restarts the sidecar (essential=false so it never takes
# the task down; see README.md).
#
# Everything this script prints goes to container stdout, i.e. -> CloudWatch via
# the ECS log driver. splunkd itself logs connection activity (deployment-server
# phone-home, indexer TCP output) only to its own file at
# $SPLUNK_HOME/var/log/splunk/splunkd.log, so we tail that file's
# connection-relevant lines to stdout too - otherwise "why isn't it connecting"
# is invisible outside the container.
#
# ---------------------------------------------------------------------------
# Why the extra logging / the license handling below matters (root cause)
# ---------------------------------------------------------------------------
# The sidecar has NO persistent Splunk volume, so /opt/splunkforwarder resets to
# its baked-in state on every container start - i.e. EVERY boot is a Splunk
# "first-time run" (FTR): the $SPLUNK_HOME/ftr marker is present and Splunk
# requires the license be accepted before it will do anything.
#
# The FTR license agreement is triggered by the *first* `splunk` CLI invocation.
# If that invocation does not carry `--accept-license --answer-yes --no-prompt`,
# Splunk prints the agreement and blocks reading a `y/n` answer from stdin. With
# no TTY and stdin /dev/null (the container has neither), the read never returns
# and the process hangs silently. The original in-app-container version probed
# `splunk status` (a *bare* invocation, output sent to /dev/null) as its first
# Splunk command, so on every real deploy it hung right there - emitting only the
# "starting" and "first boot" lines and nothing else. See run_splunk() below:
# every Splunk CLI call now carries the non-interactive license flags AND reads
# from /dev/null, and we accept the license explicitly (the version stage)
# before any probe. This diagnosis/fix is preserved from PR #729; it is a Splunk
# property, independent of whether the forwarder runs in-app or as a sidecar.
set -eu

# Read stdin from /dev/null unconditionally so an interactive-looking `splunk`
# call can never block on a terminal read even if this sidecar is (mis)launched
# with a TTY attached. run_splunk() also redirects </dev/null per call.
exec </dev/null

SPLUNK_HOME="${SPLUNK_HOME:-/opt/splunkforwarder}"
SPLUNK="$SPLUNK_HOME/bin/splunk"
SPLUNKD_LOG="$SPLUNK_HOME/var/log/splunk/splunkd.log"
DEPLOYMENTCLIENT_CONF="$SPLUNK_HOME/etc/system/local/deploymentclient.conf"
USER_SEED_CONF="$SPLUNK_HOME/etc/system/local/user-seed.conf"

# Tunables (env-overridable so tests can run fast; production defaults are sane).
POLL_INTERVAL="${SPLUNK_FWD_POLL_INTERVAL:-30}"       # seconds between status polls
READY_TIMEOUT="${SPLUNK_FWD_READY_TIMEOUT:-120}"      # max seconds to reach "running"
HEARTBEAT_EVERY="${SPLUNK_FWD_HEARTBEAT_EVERY:-10}"   # heartbeat every N poll cycles
CLI_TAIL_LINES="${SPLUNK_FWD_CLI_TAIL_LINES:-40}"     # bounded CLI output echoed
LOG_TAIL_LINES="${SPLUNK_FWD_LOG_TAIL_LINES:-50}"     # bounded splunkd.log tail on failure
STOP_TIMEOUT="${SPLUNK_FWD_STOP_TIMEOUT:-20}"         # max seconds for graceful splunk stop
                                                      # (MUST be < the ECS task stopTimeout)

# Temp file for capturing Splunk CLI stdout/stderr per invocation.
CLI_OUT="$(mktemp "${TMPDIR:-/tmp}/splunk-cli.XXXXXX")"

log() {
    echo "[splunk-forwarder] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

# Permission mode of a path, as a stable string across platforms. macOS `ls`
# appends `@` for extended attributes - which do NOT change permissions, and
# which macOS 14 adds (com.apple.provenance) to ordinary files - so the raw
# string is platform-dependent. Only that `@` is stripped; the `+` marker (an
# ACL, and what GNU ls reports for extended security) is deliberately kept,
# because an ACL can widen effective access and must stay visible.
# shellcheck disable=SC2012  # fixed, controlled paths; mode field only, never contents
mode_of() {
    ls -l "$1" 2>/dev/null | awk '{print $1}' | sed 's/@$//'
}

# Redact secret-bearing values from any text we echo (Splunk CLI output, config
# validation output, log tails). Masks the VALUE of any key whose name looks
# like a password / secret / token / symmetric key, in both `key = value` and
# `key: value` forms, without ever dropping the surrounding context. Defense in
# depth: we already avoid dumping secret files, but all captured output passes
# through here so a future command that prints a credential cannot leak it.
redact() {
    # -u (unbuffered) so lines flush immediately when redact sits mid-pipeline in
    # the streaming splunkd.log tail; harmless for the batched failure-path use.
    sed -E -u \
      -e 's/(([Pp]ass[A-Za-z0-9_]*|PASSWORD|[Ss]ecret[A-Za-z0-9_]*|SECRET|[Tt]oken[A-Za-z0-9_]*|TOKEN|pass4SymmKey|sslPassword|[Aa]pi[_-]?[Kk]ey)[[:space:]]*[=:][[:space:]]*).+/\1<redacted>/g'
}

# Print existence / ownership / mode for a path (metadata only, never contents).
path_meta() {
    _p="$1"
    if [ -e "$_p" ]; then
        # `ls -ld` gives type, mode, owner, group, size in a portable-enough form.
        # Paths here are fixed, controlled Splunk locations (no odd filenames), and
        # macOS `find` lacks `-printf`, so `ls` is the portable choice.
        # shellcheck disable=SC2012
        log "  path $_p: $(ls -ld "$_p" 2>/dev/null | awk '{print $1, "owner="$3, "group="$4, "size="$5}')"
    else
        log "  path $_p: MISSING"
    fi
}

# Emit the environment / filesystem context needed to diagnose a startup problem
# without dumping secrets or the full environment.
log_context() {
    log "context: effective uid=$(id -u) gid=$(id -g) user=$(id -un) group=$(id -gn 2>/dev/null || echo '?')"
    path_meta "$SPLUNK_HOME"
    path_meta "$SPLUNK"
    path_meta "$SPLUNK_HOME/etc/system/local"
    path_meta "$DEPLOYMENTCLIENT_CONF"
    path_meta "$SPLUNKD_LOG"
    # FTR marker presence tells us first-boot vs later-boot at a glance.
    if [ -e "$SPLUNK_HOME/ftr" ]; then
        log "  first-time-run marker present ($SPLUNK_HOME/ftr) -> Splunk will require license acceptance"
    else
        log "  first-time-run marker absent -> license already accepted on a prior boot"
    fi
}

# Run a Splunk CLI command as a named startup stage.
#   * ALWAYS carries the non-interactive license flags and reads from /dev/null,
#     so it can never block on the FTR license prompt (the root-cause fix).
#   * Captures stdout+stderr, echoes a bounded, redacted, prefixed tail.
#   * Logs sanitized command intent, stage duration, and exit code.
# Returns the command's exit code (does not itself abort under set -e).
run_splunk() {
    _label="$1"; shift
    _t0="$(date +%s)"
    set +e
    "$SPLUNK" "$@" --accept-license --answer-yes --no-prompt </dev/null >"$CLI_OUT" 2>&1
    _rc=$?
    set -e
    _t1="$(date +%s)"
    if [ -s "$CLI_OUT" ]; then
        redact < "$CLI_OUT" | tail -n "$CLI_TAIL_LINES" | sed 's/^/[splunk-cli] /'
    fi
    # Command intent is sanitized: we log the subcommand/args but represent the
    # constant license flags as a placeholder (they carry no secret anyway).
    log "stage '$_label': cmd='splunk $* [+license-flags]' exit=$_rc duration=$((_t1 - _t0))s"
    return "$_rc"
}

# Bounded tail of splunkd's own log, redacted and prefixed. Used on failure paths.
dump_splunkd_log() {
    if [ -f "$SPLUNKD_LOG" ]; then
        log "--- last $LOG_TAIL_LINES lines of $SPLUNKD_LOG (redacted) ---"
        tail -n "$LOG_TAIL_LINES" "$SPLUNKD_LOG" 2>/dev/null | redact | sed 's/^/[splunkd.log] /' \
            || log "(could not read $SPLUNKD_LOG)"
        log "--- end splunkd.log tail ---"
    else
        log "(no splunkd.log at $SPLUNKD_LOG yet)"
    fi
}

# Fail loudly: emit enough path/process metadata + a bounded log tail to diagnose,
# then exit non-zero so the container exits and ECS restarts the sidecar.
fail() {
    _rc="${2:-1}"
    log "FAILED: $1 (exit $_rc)"
    log_context
    dump_splunkd_log
    exit "$_rc"
}

# ---------------------------------------------------------------------------
# Graceful shutdown (installed EARLY, before the first Splunk command - N1)
# ---------------------------------------------------------------------------
# splunkd daemonizes into its own session; on the ECS stop signal (SIGTERM ->
# stopTimeout) we best-effort stop splunkd and clean up the tail pipeline, then
# exit 143 so the sidecar shuts down cleanly instead of being SIGKILLed.
#
# These handlers are installed BEFORE license acceptance / start / readiness so a
# stop that arrives DURING startup still gets a graceful splunk stop (previously the
# traps were installed only after readiness, leaving the whole startup window
# uncovered). TAIL_PID is guarded because it is not set until stage 6.
#
# The stop is BOUNDED by STOP_TIMEOUT: `splunk stop` can itself hang, and an
# unbounded stop would run until ECS SIGKILLs the container at stopTimeout, losing
# the clean exit. We run stop in the background and abandon it past the deadline.
# shellcheck disable=SC2329  # invoked indirectly via `trap`
cleanup() {
    [ -n "${TAIL_PID:-}" ] && kill "$TAIL_PID" 2>/dev/null || true
}
# shellcheck disable=SC2329  # invoked indirectly via `trap`
bounded_splunk_stop() {
    _t0="$(date +%s)"
    ( "$SPLUNK" stop --accept-license --answer-yes --no-prompt </dev/null >/dev/null 2>&1 ) &
    _stop_pid=$!
    while kill -0 "$_stop_pid" 2>/dev/null; do
        if [ "$(( $(date +%s) - _t0 ))" -ge "$STOP_TIMEOUT" ]; then
            kill "$_stop_pid" 2>/dev/null || true
            log "stage 'stop': 'splunk stop' exceeded ${STOP_TIMEOUT}s - abandoned (container will exit; ECS reaps)"
            return 1
        fi
        sleep 1
    done
    log "stage 'stop': 'splunk stop' completed within ${STOP_TIMEOUT}s"
    return 0
}
# shellcheck disable=SC2329  # invoked indirectly via `trap`
shutdown() {
    log "received stop signal - stopping splunkd (bounded ${STOP_TIMEOUT}s)"
    bounded_splunk_stop || true
    cleanup
    exit 143
}
trap 'cleanup' EXIT
trap 'shutdown' INT TERM

# ---------------------------------------------------------------------------
# Stage 0: announce + context
# ---------------------------------------------------------------------------
DEPLOY_TARGET="$(sed -n 's/^targetUri[ ]*=[ ]*//p' "$DEPLOYMENTCLIENT_CONF" 2>/dev/null || true)"
log "starting: SPLUNK_HOME=$SPLUNK_HOME user=$(id -un) deployment-server=${DEPLOY_TARGET:-<none configured>}"
log_context

if [ ! -x "$SPLUNK" ]; then
    fail "Splunk binary $SPLUNK is missing or not executable" 1
fi

# ---------------------------------------------------------------------------
# Stage 1: first-boot credential seeding (no secret ever logged)
# ---------------------------------------------------------------------------
# Seed a random admin credential so `splunk start` is fully non-interactive
# (Splunk requires admin creds on first start). No secret is baked into the
# image - it is generated per container on first boot, written only to Splunk's
# own config with owner-only permissions, and never echoed.
if [ ! -e "$SPLUNK_HOME/etc/passwd" ] && [ ! -e "$USER_SEED_CONF" ]; then
    log "stage 'seed-credential': first boot - seeding random admin credential (user-seed.conf)"
    SEED_PW="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
    ( umask 077; printf '[user_info]\nUSERNAME = admin\nPASSWORD = %s\n' "$SEED_PW" > "$USER_SEED_CONF" )
    unset SEED_PW
    log "stage 'seed-credential': wrote $USER_SEED_CONF (mode $(mode_of "$USER_SEED_CONF"))"
else
    log "stage 'seed-credential': skipped (credential already present)"
fi

# ---------------------------------------------------------------------------
# Stage 2: accept license + capture forwarder version
# ---------------------------------------------------------------------------
# `splunk version` with the license flags is the FIRST Splunk invocation. It
# accepts the FTR license non-interactively (clearing the ftr marker) so every
# later command - including the status probe - is safe, and it surfaces the
# forwarder version for the operator.
if ! run_splunk "version" version; then
    fail "'splunk version' failed - cannot accept license / determine version"
fi

# ---------------------------------------------------------------------------
# Stage 3: validate configuration (non-fatal warning if btool unavailable)
# ---------------------------------------------------------------------------
# `btool check` validates conf syntax across the app; its output is redacted
# before we echo it. Treated as advisory - a validation warning should not stop
# the forwarder, but it should be visible.
if run_splunk "config-validate" btool check; then
    log "stage 'config-validate': configuration validated"
else
    log "stage 'config-validate': WARNING - btool check reported issues (see [splunk-cli] lines above); continuing"
fi

# ---------------------------------------------------------------------------
# Stage 4: start splunkd if not already running
# ---------------------------------------------------------------------------
# The status probe is now safe (license already accepted in stage 2, flags +
# </dev/null on every call). Guarded so a re-exec of this entrypoint while
# splunkd is still up does not error out on "already running".
if run_splunk "status-probe" status; then
    log "stage 'start': splunkd already running (entrypoint re-exec while splunkd up)"
else
    log "stage 'start': splunkd not running - starting it"
    if run_splunk "start" start; then
        log "stage 'start': 'splunk start' returned success"
    else
        rc=$?
        fail "'splunk start' failed" "$rc"
    fi
fi

# ---------------------------------------------------------------------------
# Stage 5: bounded readiness check
# ---------------------------------------------------------------------------
# Poll status until splunkd reports running, up to READY_TIMEOUT. Report the
# child PID from the pid file when available. Fail loudly on timeout.
log "stage 'readiness': waiting up to ${READY_TIMEOUT}s for splunkd to report running"
PIDFILE="$SPLUNK_HOME/var/run/splunk/splunkd.pid"
[ -f "$PIDFILE" ] || PIDFILE="$SPLUNK_HOME/var/run/splunkd.pid"
waited=0
ready=0
while [ "$waited" -lt "$READY_TIMEOUT" ]; do
    if run_splunk "readiness-poll" status; then
        ready=1
        break
    fi
    waited=$((waited + POLL_INTERVAL))
    sleep "$POLL_INTERVAL"
done
if [ "$ready" -ne 1 ]; then
    fail "splunkd did not reach 'running' within ${READY_TIMEOUT}s" 1
fi
SPLUNKD_PID="$(cat "$PIDFILE" 2>/dev/null || echo '?')"
log "stage 'readiness': splunkd is running (pid=$SPLUNKD_PID) after ${waited}s"

# ---------------------------------------------------------------------------
# Stage 6: surface splunkd connection activity on stdout
# ---------------------------------------------------------------------------
# deployment-server phone-home (DeployClient/DC:*), indexer output
# (TcpOutputProc/AutoLoadBalanced*), the deployment server's push channel
# (HttpPubSubConnection), and any WARN/ERROR. tail -F tolerates the file not
# existing yet and follows across rotation. -n 200 replays recent history on
# sidecar restarts without re-emitting the whole (up to 25MB) file; on first
# boot the file is new so nothing is lost. Output is redacted defensively.
tail -n 200 -F "$SPLUNKD_LOG" 2>/dev/null \
    | grep --line-buffered -E 'ERROR|WARN|DeployClient|DC:|TcpOutputProc|AutoLoadBalanced|HttpPubSubConnection|Connected to idx|connectionType' \
    | ( redact 2>/dev/null || cat ) \
    | sed -u 's/^/[splunkd.log] /' &
TAIL_PID=$!

# Graceful-shutdown traps were already installed early (before license acceptance);
# nothing to (re)install here. The backgrounded TAIL_PID above is now covered by the
# existing cleanup()/shutdown() handlers.

log "HEALTHY: splunk forwarder started; splunkd running (pid=$SPLUNKD_PID), deployment-server=${DEPLOY_TARGET:-<none>}, monitoring for connection activity"

# ---------------------------------------------------------------------------
# Stage 7: stay in the foreground and tie lifetime to splunkd
# ---------------------------------------------------------------------------
# Poll status; if splunkd goes away exit non-zero so the sidecar exits and ECS
# restarts it. Log a heartbeat every ~HEARTBEAT_EVERY cycles so CloudWatch shows
# the forwarder is alive even when splunkd emits nothing.
i=0
while run_splunk "liveness-poll" status >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$HEARTBEAT_EVERY" -gt 0 ] && [ $((i % HEARTBEAT_EVERY)) -eq 0 ]; then
        log "heartbeat: splunkd up (pid=$(cat "$PIDFILE" 2>/dev/null || echo '?')); deployment-server=${DEPLOY_TARGET:-<none>}"
    fi
    sleep "$POLL_INTERVAL"
done

fail "splunkd is no longer running - exiting for ECS sidecar restart" 1
