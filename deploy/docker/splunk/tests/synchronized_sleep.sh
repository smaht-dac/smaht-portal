#!/bin/sh
# TEST 10's first steady-state sleep is a rendezvous, not a wall-clock delay.
# Hold the real entrypoint in its foreground wait until the driver sends TERM.
# Later sleeps (including bounded_splunk_stop) keep their real behavior.
set -eu

if mkdir "$SPLUNK_TEST_SYNC_DIR/claimed" 2>/dev/null; then
    # For the successful later-boot scenario, the first sleep must follow
    # HEALTHY. Fail rather than silently synchronizing to a startup failure.
    grep -Fq 'HEALTHY: splunk forwarder started' "$SPLUNK_TEST_OUT"
    echo "$$" > "$SPLUNK_TEST_SYNC_DIR/sleep.pid"
    trap 'rm -f "$SPLUNK_TEST_SYNC_DIR/sleep.pid"' 0
    trap 'exit 1' INT TERM
    printf 'ready\n' > "$SPLUNK_TEST_SYNC_DIR/ready"
    IFS= read -r release < "$SPLUNK_TEST_SYNC_DIR/release"
    [ "$release" = release ]
    exit
fi

exec "$SPLUNK_TEST_REAL_SLEEP" "$@"
