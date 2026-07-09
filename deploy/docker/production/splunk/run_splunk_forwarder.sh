#!/bin/sh
# Run the Splunk Universal Forwarder under supervisord.
#
# This image has no systemd, so the HMS doc's boot-start step
# (`splunk enable boot-start -systemd-managed 1 -user splunkfwd ...`) is replaced
# by running the forwarder as a supervisord program. It runs as the container's
# non-root `nginx` user - which already satisfies the doc's "do NOT run as root"
# requirement - so no dedicated splunkfwd user is created.
set -eu

SPLUNK_HOME="${SPLUNK_HOME:-/opt/splunkforwarder}"
SPLUNK="$SPLUNK_HOME/bin/splunk"

# First run only: seed a random admin credential so `splunk start` is fully
# non-interactive (Splunk requires admin creds on first start). No secret is
# baked into the image - it is generated per container on first boot, written
# only to Splunk's own config, and never echoed.
if [ ! -e "$SPLUNK_HOME/etc/passwd" ] && \
   [ ! -e "$SPLUNK_HOME/etc/system/local/user-seed.conf" ]; then
    SEED_PW="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
    printf '[user_info]\nUSERNAME = admin\nPASSWORD = %s\n' "$SEED_PW" \
        > "$SPLUNK_HOME/etc/system/local/user-seed.conf"
    unset SEED_PW
fi

# Start splunkd if it is not already running. Guarded so a supervisord restart of
# this program (while splunkd is still up) does not error out on "already running".
if ! "$SPLUNK" status >/dev/null 2>&1; then
    "$SPLUNK" start --accept-license --answer-yes --no-prompt
fi

# Stay in the foreground and tie this program's lifetime to splunkd: poll status,
# and if splunkd goes away exit non-zero so supervisord restarts us (and it).
while "$SPLUNK" status >/dev/null 2>&1; do
    sleep 30
done

echo "splunkd is no longer running - exiting for supervisor restart" >&2
exit 1
