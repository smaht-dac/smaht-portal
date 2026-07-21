#!/bin/sh
# Run the Splunk Universal Forwarder under supervisord.
#
# This image has no systemd, so the HMS doc's boot-start step
# (`splunk enable boot-start -systemd-managed 1 -user splunkfwd ...`) is replaced
# by running the forwarder as a supervisord program. It runs as the container's
# non-root `nginx` user - which already satisfies the doc's "do NOT run as root"
# requirement - so no dedicated splunkfwd user is created.
#
# Everything this script prints goes to supervisord's stdout_logfile=/dev/stdout,
# i.e. container stdout -> CloudWatch. splunkd itself logs connection activity
# (deployment-server phone-home, indexer TCP output) only to its own file at
# $SPLUNK_HOME/var/log/splunk/splunkd.log, so we tail that file's
# connection-relevant lines to stdout too - otherwise "why isn't it connecting"
# is invisible outside the container.
#
# ---------------------------------------------------------------------------
# Why the extra logging / the license handling below matters (root cause)
# ---------------------------------------------------------------------------
# The image has NO persistent Splunk volume, so /opt/splunkforwarder resets to
# its baked-in state on every container start - i.e. EVERY boot is a Splunk
# "first-time run" (FTR): the $SPLUNK_HOME/ftr marker is present and Splunk
# requires the license be accepted before it will do anything.
#
# The FTR license agreement is triggered by the *first* `splunk` CLI invocation.
# If that invocation does not carry `--accept-license --answer-yes --no-prompt`,
# Splunk prints the agreement and blocks reading a `y/n` answer from stdin. Under
# supervisord there is no TTY and stdin is /dev/null, so the read never returns
# and the wrapper hangs silently. A previous version probed `splunk status`
# (a *bare* invocation, output sent to /dev/null) as its first Splunk command,
# so on every real deploy it hung right there - emitting only the "starting" and
# "first boot" lines and nothing else. See run_splunk() below: every Splunk CLI
# call now carries the non-interactive license flags AND reads from /dev/null,
# and we accept the license explicitly (the version stage) before any probe.
set -eu

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

# Temp file for capturing Splunk CLI stdout/stderr per invocation.
CLI_OUT="$(mktemp "${TMPDIR:-/tmp}/splunk-cli.XXXXXX")"

log() {
    echo "[splunk-forwarder] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
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
# then exit non-zero so supervisord restarts us.
fail() {
    _rc="${2:-1}"
    log "FAILED: $1 (exit $_rc)"
    log_context
    dump_splunkd_log
    exit "$_rc"
}

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
    # shellcheck disable=SC2012  # fixed path; report mode only, never contents
    log "stage 'seed-credential': wrote $USER_SEED_CONF (mode $(ls -l "$USER_SEED_CONF" | awk '{print $1}'))"
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
# </dev/null on every call). Guarded so a supervisord restart of this wrapper
# while splunkd is still up does not error out on "already running".
if run_splunk "status-probe" status; then
    log "stage 'start': splunkd already running (supervisord restarted this wrapper)"
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
# wrapper restarts without re-emitting the whole (up to 25MB) file; on first
# boot the file is new so nothing is lost. Output is redacted defensively.
tail -n 200 -F "$SPLUNKD_LOG" 2>/dev/null \
    | grep --line-buffered -E 'ERROR|WARN|DeployClient|DC:|TcpOutputProc|AutoLoadBalanced|HttpPubSubConnection|Connected to idx|connectionType' \
    | ( redact 2>/dev/null || cat ) \
    | sed -u 's/^/[splunkd.log] /' &
TAIL_PID=$!

# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------
# splunkd daemonizes into its own session, so supervisord's killasgroup may not
# reach it; on stop signals we best-effort stop splunkd (bounded) and clean up
# the tail pipeline, then exit 143 so the wrapper does not outlive its work.
# shellcheck disable=SC2329  # invoked indirectly via `trap`
cleanup() {
    kill "$TAIL_PID" 2>/dev/null || true
}
# shellcheck disable=SC2329  # invoked indirectly via `trap`
shutdown() {
    log "received stop signal - stopping splunkd"
    run_splunk "stop" stop || log "stage 'stop': 'splunk stop' returned non-zero (continuing shutdown)"
    cleanup
    exit 143
}
trap 'cleanup' EXIT
trap 'shutdown' INT TERM

log "HEALTHY: splunk forwarder started; splunkd running (pid=$SPLUNKD_PID), deployment-server=${DEPLOY_TARGET:-<none>}, monitoring for connection activity"

# ---------------------------------------------------------------------------
# Stage 7: stay in the foreground and tie lifetime to splunkd
# ---------------------------------------------------------------------------
# Poll status; if splunkd goes away exit non-zero so supervisord restarts us
# (and it). Log a heartbeat every ~HEARTBEAT_EVERY cycles so CloudWatch shows
# the forwarder is alive even when splunkd emits nothing.
i=0
while run_splunk "liveness-poll" status >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$HEARTBEAT_EVERY" -gt 0 ] && [ $((i % HEARTBEAT_EVERY)) -eq 0 ]; then
        log "heartbeat: splunkd up (pid=$(cat "$PIDFILE" 2>/dev/null || echo '?')); deployment-server=${DEPLOY_TARGET:-<none>}"
    fi
    sleep "$POLL_INTERVAL"
done

fail "splunkd is no longer running - exiting for supervisor restart" 1
