#!/bin/sh
# Test double for the Splunk Universal Forwarder `splunk` CLI.
#
# It is keyed on the DEFECT that broke the real forwarder, not on the symptom:
# it only proceeds non-interactively when the invocation carries the license
# flags `--accept-license --answer-yes --no-prompt` (or the license was already
# accepted, i.e. the first-time-run marker $SPLUNK_HOME/ftr is gone). Otherwise,
# on a fresh tree, it reproduces the real first-run license prompt and blocks on
# a stdin read - exactly what hung the wrapper under supervisord.
#
# Failure injection (env vars) lets the regression tests drive the failure and
# readiness paths without a real Splunk install:
#   FAKE_SPLUNK_EOF   = hang | fail    behavior when the license read hits EOF
#   FAKE_SPLUNK_START = ok | fail | never_ready   `splunk start` outcome
set -eu

SPLUNK_HOME="${SPLUNK_HOME:?SPLUNK_HOME must be set}"
FTR="$SPLUNK_HOME/ftr"
PIDFILE="$SPLUNK_HOME/var/run/splunkd.pid"
SPLUNKD_LOG="$SPLUNK_HOME/var/log/splunk/splunkd.log"
EOF_MODE="${FAKE_SPLUNK_EOF:-hang}"

mkdir -p "$SPLUNK_HOME/var/run" "$SPLUNK_HOME/var/log/splunk"

have_flags() {
    a=0; y=0; n=0
    for arg in "$@"; do
        case "$arg" in
            --accept-license) a=1 ;;
            --answer-yes) y=1 ;;
            --no-prompt) n=1 ;;
        esac
    done
    [ "$a" = 1 ] && [ "$y" = 1 ] && [ "$n" = 1 ]
}

license_gate() {
    if [ -e "$FTR" ] && ! have_flags "$@"; then
        printf 'This appears to be your first time running this version of Splunk.\n' >&2
        printf 'Do you agree with this license? [y/n]: ' >&2
        if IFS= read -r ans; then
            [ "$ans" = "y" ] || { echo "License not accepted." >&2; exit 1; }
        else
            # EOF on a non-interactive stdin (/dev/null under supervisord).
            if [ "$EOF_MODE" = "fail" ]; then
                echo "License not accepted (EOF)." >&2
                exit 1
            fi
            while true; do sleep 3600; done   # hang, like the real binary
        fi
    fi
    rm -f "$FTR"
}

CMD="${1:-}"
[ "$#" -gt 0 ] && shift || true

case "$CMD" in
    status)
        license_gate "$@"
        if [ -e "$PIDFILE" ]; then
            echo "splunkd is running (PID: $(cat "$PIDFILE"))."
            exit 0
        fi
        echo "splunkd is not running."
        exit 3
        ;;
    start)
        license_gate "$@"
        echo "Starting splunkd..."
        echo "$(date -u '+%Y-%m-%d %H:%M:%S') INFO  loader - Splunkd starting." >> "$SPLUNKD_LOG"
        if [ "${FAKE_SPLUNK_START:-ok}" = "fail" ]; then
            echo "$(date -u '+%Y-%m-%d %H:%M:%S') ERROR TcpOutputProc - config error" >> "$SPLUNKD_LOG"
            # Leaked-credential lines to prove the wrapper's redactor scrubs them.
            echo "Failed. sslPassword = SUPERSECRETVALUE not accepted" >&2
            echo "admin password = hunter2 was rejected" >&2
            exit 1
        fi
        echo "Done" >> "$SPLUNKD_LOG"
        # A connection-activity line (matches the wrapper's stage-6 grep filter)
        # that carries a secret, to prove the backgrounded tail -F pipeline
        # redacts splunkd.log content on the success path too.
        echo "$(date -u '+%Y-%m-%d %H:%M:%S') WARN  TcpOutputProc - sslPassword = STAGE6SECRETVALUE in outputs" >> "$SPLUNKD_LOG"
        if [ "${FAKE_SPLUNK_START:-ok}" != "never_ready" ]; then
            echo "99999" > "$PIDFILE"
        fi
        echo "The Splunk web interface is at ... done."
        exit 0
        ;;
    stop)
        license_gate "$@"
        rm -f "$PIDFILE"
        echo "Stopping splunkd..."
        exit 0
        ;;
    version)
        license_gate "$@"
        echo "Splunk Universal Forwarder 9.4.12 (build 9dfc486f3d48)"
        exit 0
        ;;
    btool)
        license_gate "$@"
        exit 0
        ;;
    *)
        license_gate "$@"
        echo "fake-splunk: unhandled command '$CMD'" >&2
        exit 0
        ;;
esac
