#!/bin/sh
# First poll sleep is a rendezvous followed by a real production-length sleep.
# Only the entrypoint may terminate it; the test driver never releases it.
set -eu

if mkdir "$SPLUNK_TEST_SYNC_DIR/claimed" 2>/dev/null; then
    if [ "$SPLUNK_TEST_STAGE" = steady ]; then
        grep -Fq 'HEALTHY: splunk forwarder started' "$SPLUNK_TEST_OUT"
    else
        grep -Fq "stage 'readiness-poll'" "$SPLUNK_TEST_OUT"
    fi
    echo "$$" > "$SPLUNK_TEST_SYNC_DIR/sleep.pid"
    printf 'ready\n' > "$SPLUNK_TEST_SYNC_DIR/ready"
fi

exec "$SPLUNK_TEST_REAL_SLEEP" "$@"
