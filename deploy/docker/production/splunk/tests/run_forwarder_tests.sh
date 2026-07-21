#!/bin/sh
# Regression tests for run_splunk_forwarder.sh.
#
# Self-contained: no real Splunk, no network, no AWS. Each case installs the
# fake_splunk.sh double into a throwaway SPLUNK_HOME, then runs the real wrapper
# the way supervisord does (stdin from /dev/null, stdout+stderr merged) and
# asserts on the captured output and exit code.
#
# Run directly:  sh deploy/docker/production/splunk/tests/run_forwarder_tests.sh
# Exit 0 = all cases passed.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$(cd "$HERE/.." && pwd)/run_splunk_forwarder.sh"
FAKE="$HERE/fake_splunk.sh"

PASS=0
FAIL=0

# Run the wrapper in a disposable SPLUNK_HOME. Args mirror the deployed path.
#   $1 boot  : first | later | running
#   $2 eof   : hang | fail          (license read on EOF)
#   $3 start : ok | fail | never_ready
#   $4 secs  : hard timeout before we TERM the wrapper
# Captured output is left in $RUN_OUT, exit code in $RUN_RC.
run_case() {
    _boot="$1"; _eof="$2"; _start="$3"; _timeout="$4"
    WORK="$(mktemp -d "${TMPDIR:-/tmp}/splunk-fwd-test.XXXXXX")"
    export SPLUNK_HOME="$WORK/opt/splunkforwarder"
    mkdir -p "$SPLUNK_HOME/bin" "$SPLUNK_HOME/etc/system/local" \
             "$SPLUNK_HOME/var/log/splunk" "$SPLUNK_HOME/var/run"
    cp "$FAKE" "$SPLUNK_HOME/bin/splunk"
    chmod +x "$SPLUNK_HOME/bin/splunk"
    cat > "$SPLUNK_HOME/etc/system/local/deploymentclient.conf" <<'EOF'
[deployment-client]
[target-broker:deploymentServer]
targetUri = 10.124.5.202:8089
EOF
    case "$_boot" in
        first)   : > "$SPLUNK_HOME/ftr" ;;
        later)   : > "$SPLUNK_HOME/etc/passwd"
                 printf '[user_info]\nUSERNAME = admin\nPASSWORD = redacted\n' \
                     > "$SPLUNK_HOME/etc/system/local/user-seed.conf" ;;
        running) : > "$SPLUNK_HOME/etc/passwd"
                 echo "12345" > "$SPLUNK_HOME/var/run/splunkd.pid" ;;
    esac

    export FAKE_SPLUNK_EOF="$_eof"
    export FAKE_SPLUNK_START="$_start"
    # Make the poll/readiness/heartbeat loops fast for tests.
    export SPLUNK_FWD_POLL_INTERVAL=1
    export SPLUNK_FWD_READY_TIMEOUT=3
    export SPLUNK_FWD_HEARTBEAT_EVERY=2

    # Keep the captured output in a persistent file so assertions can read it
    # after the disposable SPLUNK_HOME tree is removed.
    RUN_OUT="$(mktemp "${TMPDIR:-/tmp}/splunk-fwd-out.XXXXXX")"
    (
        sh "$SCRIPT" </dev/null >"$RUN_OUT" 2>&1 &
        _child=$!
        ( sleep "$_timeout"; kill -TERM "$_child" 2>/dev/null
          sleep 2; kill -KILL "$_child" 2>/dev/null ) &
        _killer=$!
        wait "$_child"; _rc=$?
        kill "$_killer" 2>/dev/null
        echo "$_rc" > "$RUN_OUT.rc"
    )
    RUN_RC="$(cat "$RUN_OUT.rc" 2>/dev/null || echo '??')"
    rm -rf "$WORK"
}

# --- assertion helpers -----------------------------------------------------
# Patterns are passed as ordinary arguments (no nested command substitution),
# so single quotes and brackets in patterns are safe.
ok()  { echo "  ok: $1"; PASS=$((PASS + 1)); }
bad() {
    echo "  FAIL: $1"; FAIL=$((FAIL + 1))
    echo "  ---- output was ----"; sed 's/^/    | /' "$RUN_OUT"; echo "  --------------------"
}
want()    { if grep -Fq -- "$2" "$RUN_OUT"; then ok "$1"; else bad "$1"; fi; }   # fixed-string present
wantnot() { if grep -Fq -- "$2" "$RUN_OUT"; then bad "$1"; else ok "$1"; fi; }   # fixed-string absent
wantre()  { if grep -Eq -- "$2" "$RUN_OUT"; then ok "$1"; else bad "$1"; fi; }   # ERE present
want_rc_nonzero() { if [ "$RUN_RC" != 0 ]; then ok "$1"; else bad "$1"; fi; }
want_more_than_two_lines() {
    if [ "$(wc -l < "$RUN_OUT")" -gt 2 ]; then ok "$1"; else bad "$1"; fi;
}

# ---------------------------------------------------------------------------
echo "TEST 1: first boot (license read HANGS on EOF) - the original two-line hang"
# This is the exact deployed scenario. Must NOT hang; must reach HEALTHY.
run_case first hang ok 8
want "reaches explicit HEALTHY message" "HEALTHY: splunk forwarder started"
want_more_than_two_lines "does not stop after the first two log lines"

echo "TEST 2: every major startup stage is visible on success"
want   "seed-credential stage visible" "stage 'seed-credential'"
want   "version stage visible"         "stage 'version'"
want   "config-validate stage visible" "stage 'config-validate'"
want   "start stage visible"           "stage 'start'"
want   "readiness stage visible"       "stage 'readiness'"
want   "forwarder version captured"    "Splunk Universal Forwarder 9.4.12"
wantre "effective uid/gid logged"      "context: effective uid=[0-9]+ gid=[0-9]+"
wantre "path ownership/mode logged"    "path .*bin/splunk: -rwx"
want   "CLI stdout/stderr is prefixed" "[splunk-cli]"
wantre "stage duration + exit logged"  "stage 'start':.*exit=[0-9]+ duration=[0-9]+s"

echo "TEST 3: seeded admin credential is never printed"
run_case first hang ok 8
# The wrapper writes user-seed.conf but must never echo the generated password.
wantnot "no PASSWORD = value on stdout" "PASSWORD ="
want    "seed file mode is owner-only"  "user-seed.conf (mode -rw-------)"

echo "TEST 4: first boot works even if the license read FAILS on EOF (robust to both)"
run_case first fail ok 8
want "still reaches HEALTHY under EOF=fail" "HEALTHY: splunk forwarder started"

echo "TEST 5: 'splunk start' failure identifies the command + exit code and fails loudly"
run_case first hang fail 8
want            "names the failed command"        "'splunk start' failed"
wantre          "reports the exit code"           "FAILED:.*\(exit 1\)"
want            "dumps a bounded splunkd.log tail" "[splunkd.log]"
want_rc_nonzero "exits non-zero"
wantnot         "does NOT claim HEALTHY on failure" "HEALTHY"

echo "TEST 6: secrets in Splunk CLI output are redacted on the failure path"
# The fake leaks 'sslPassword = SUPERSECRETVALUE' and 'password = hunter2'.
wantnot "raw secret value SUPERSECRETVALUE absent" "SUPERSECRETVALUE"
wantnot "raw secret value hunter2 absent"          "hunter2"
want    "redaction marker present"                 "<redacted>"

echo "TEST 7: readiness timeout / non-running splunkd fails loudly and non-zero"
run_case first hang never_ready 10
want            "reports readiness timeout" "did not reach 'running'"
want_rc_nonzero "exits non-zero on timeout"
wantnot         "never claims HEALTHY" "HEALTHY"

echo "TEST 8: later boot (already licensed) reaches HEALTHY"
run_case later hang ok 8
want "later boot reaches HEALTHY"  "HEALTHY"
want "skips credential seeding"    "stage 'seed-credential': skipped"

echo "TEST 9: supervisord restart while splunkd already up does not error"
run_case running hang ok 8
want "detects already-running splunkd" "splunkd already running"
want "reaches HEALTHY without restart" "HEALTHY"

echo "TEST 10: graceful shutdown on SIGTERM stops splunkd"
run_case later hang ok 6
want "handles stop signal" "received stop signal"
want "invokes splunk stop" "stage 'stop'"

echo "TEST 11: the backgrounded splunkd.log tail (success path) redacts secrets"
# The fake writes a WARN line carrying 'sslPassword = STAGE6SECRETVALUE' to
# splunkd.log on a successful start; the wrapper's stage-6 tail -F pipeline must
# surface it (it matches the connection-activity filter) but redacted.
run_case first hang ok 8
want    "splunkd.log activity is surfaced"       "[splunkd.log]"
wantnot "raw splunkd.log secret STAGE6SECRETVALUE absent" "STAGE6SECRETVALUE"
want    "splunkd.log secret is redacted"         "<redacted>"

echo
echo "==================================================================="
echo "PASSED: $PASS   FAILED: $FAIL"
echo "==================================================================="
[ "$FAIL" -eq 0 ]
