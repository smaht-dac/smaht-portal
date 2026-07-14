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
set -eu

SPLUNK_HOME="${SPLUNK_HOME:-/opt/splunkforwarder}"
SPLUNK="$SPLUNK_HOME/bin/splunk"
SPLUNKD_LOG="$SPLUNK_HOME/var/log/splunk/splunkd.log"

log() {
    echo "[splunk-forwarder] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

DEPLOY_TARGET="$(sed -n 's/^targetUri[ ]*=[ ]*//p' \
    "$SPLUNK_HOME/etc/system/local/deploymentclient.conf" 2>/dev/null || true)"
log "starting: SPLUNK_HOME=$SPLUNK_HOME user=$(id -un) deployment-server=${DEPLOY_TARGET:-<none configured>}"

# First run only: seed a random admin credential so `splunk start` is fully
# non-interactive (Splunk requires admin creds on first start). No secret is
# baked into the image - it is generated per container on first boot, written
# only to Splunk's own config, and never echoed.
if [ ! -e "$SPLUNK_HOME/etc/passwd" ] && \
   [ ! -e "$SPLUNK_HOME/etc/system/local/user-seed.conf" ]; then
    log "first boot: seeding random admin credential (user-seed.conf)"
    SEED_PW="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
    printf '[user_info]\nUSERNAME = admin\nPASSWORD = %s\n' "$SEED_PW" \
        > "$SPLUNK_HOME/etc/system/local/user-seed.conf"
    unset SEED_PW
fi

# Start splunkd if it is not already running. Guarded so a supervisord restart of
# this program (while splunkd is still up) does not error out on "already running".
if ! "$SPLUNK" status >/dev/null 2>&1; then
    log "splunkd not running - starting it"
    if "$SPLUNK" start --accept-license --answer-yes --no-prompt; then
        log "splunkd started"
    else
        rc=$?
        log "ERROR: 'splunk start' failed (exit $rc); dumping tail of splunkd.log:"
        tail -n 50 "$SPLUNKD_LOG" 2>/dev/null || log "(no splunkd.log yet)"
        exit "$rc"
    fi
else
    log "splunkd already running (supervisord restarted this wrapper)"
fi

# Surface splunkd's connection activity on container stdout: deployment-server
# phone-home (DeployClient/DC:*), indexer output (TcpOutputProc/AutoLoadBalanced*),
# the deployment server's push channel (HttpPubSubConnection), and any WARN/ERROR.
# tail -F tolerates the file not existing yet and follows across rotation.
# -n 200 replays recent history on wrapper restarts without re-emitting the
# whole (up to 25MB) file; on first boot the file is new so nothing is lost.
tail -n 200 -F "$SPLUNKD_LOG" 2>/dev/null \
    | grep --line-buffered -E 'ERROR|WARN|DeployClient|DC:|TcpOutputProc|AutoLoadBalanced|HttpPubSubConnection|Connected to idx|connectionType' \
    | sed -u 's/^/[splunkd.log] /' &
TAIL_PID=$!
trap 'kill "$TAIL_PID" 2>/dev/null || true' EXIT
# Exit (running the EXIT trap) on stop signals; a signal trap that only cleans
# up would otherwise leave the script alive after supervisord's SIGTERM.
trap 'exit 143' INT TERM

# Stay in the foreground and tie this program's lifetime to splunkd: poll status,
# and if splunkd goes away exit non-zero so supervisord restarts us (and it).
# Log a heartbeat every ~5 minutes so CloudWatch shows the forwarder is alive
# even when splunkd emits nothing.
HEARTBEAT_EVERY=10
i=0
while "$SPLUNK" status >/dev/null 2>&1; do
    i=$((i + 1))
    if [ $((i % HEARTBEAT_EVERY)) -eq 0 ]; then
        log "heartbeat: splunkd up; deployment-server=${DEPLOY_TARGET:-<none>}"
    fi
    sleep 30
done

log "ERROR: splunkd is no longer running - dumping tail of splunkd.log, then exiting for supervisor restart"
tail -n 50 "$SPLUNKD_LOG" 2>/dev/null || log "(no splunkd.log found)"
exit 1
