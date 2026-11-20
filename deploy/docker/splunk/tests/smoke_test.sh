#!/bin/sh
# Real-image smoke test for the Splunk Universal Forwarder sidecar (N2).
#
# Unlike run_forwarder_tests.sh (which drives entrypoint.sh against a FAKE splunk
# CLI), this BUILDS the actual sidecar image and runs the REAL Splunk 9.4.12 binary
# as uid/gid 4321, so it exercises the packaging path the fake cannot: the
# downloaded+sha256-verified deb, dynamic libraries, license acceptance, splunkd
# start/readiness, graceful SIGTERM stop, and absence of raw secrets in the log.
#
# REQUIRES a Docker daemon and network access to download.splunk.com (for the deb)
# and the base image. It is therefore NOT part of the unit-test stack / make
# test-unit and is NOT run in the offline dev/CI unit path. Run it before a first
# deployment.
#
#   sh deploy/docker/splunk/tests/smoke_test.sh [--base <image>]
#
# Default base is the public debian:bookworm-slim so it builds without private
# registry auth; pass --base dhi.io/python:3.11-debian-sfw-dev to smoke-test the
# hardened base once you are authenticated to it.
set -eu

BASE="debian:bookworm-slim"
[ "${1:-}" = "--base" ] && { BASE="$2"; shift 2; }

HERE="$(cd "$(dirname "$0")" && pwd)"
CTX="$(cd "$HERE/.." && pwd)"
IMG="smaht-splunk-sidecar:smoke"
NAME="smaht-splunk-smoke-$$"

command -v docker >/dev/null 2>&1 || { echo "SKIP: docker not installed"; exit 77; }
docker info >/dev/null 2>&1 || { echo "SKIP: docker daemon not reachable"; exit 77; }

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== building sidecar image (base=$BASE) =="
docker build --platform linux/amd64 --build-arg BASE_IMAGE="$BASE" \
    -t "$IMG" -f "$CTX/Dockerfile" "$CTX"

echo "== running sidecar (fast readiness knobs) =="
# No real deployment server is reachable; splunkd still starts and reaches HEALTHY
# (phone-home simply fails), which is what we assert. Short timeouts keep it quick.
docker run -d --name "$NAME" \
    -e SPLUNK_FWD_POLL_INTERVAL=2 -e SPLUNK_FWD_READY_TIMEOUT=90 \
    "$IMG" >/dev/null

# Wait up to ~120s for the HEALTHY line.
ok=0
i=0
while [ "$i" -lt 60 ]; do
    if docker logs "$NAME" 2>&1 | grep -q "HEALTHY: splunk forwarder started"; then ok=1; break; fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" != "true" ]; then break; fi
    i=$((i + 1)); sleep 2
done

LOG="$(docker logs "$NAME" 2>&1 || true)"
fail=0
check() { if printf '%s' "$LOG" | grep -q -- "$2"; then echo "  ok: $1"; else echo "  FAIL: $1"; fail=1; fi; }
checknot() { if printf '%s' "$LOG" | grep -q -- "$2"; then echo "  FAIL: $1"; fail=1; else echo "  ok: $1"; fi; }

echo "== assertions =="
if [ "$ok" = 1 ]; then echo "  ok: reached HEALTHY"; else echo "  FAIL: never reached HEALTHY"; fail=1; fi
check    "runs as uid/gid 4321 (splunkfwd)"     "effective uid=4321 gid=4321"
check    "real forwarder version reported"      "Splunk Universal Forwarder 9.4.12"
check    "readiness stage ran"                  "stage 'readiness'"
checknot "generated admin password not printed" "PASSWORD ="

echo "== graceful SIGTERM stop =="
docker stop -t 30 "$NAME" >/dev/null 2>&1 || true
LOG="$(docker logs "$NAME" 2>&1 || true)"
check "handled stop signal" "received stop signal"

echo
if [ "$fail" = 0 ]; then echo "SMOKE TEST PASSED"; else echo "SMOKE TEST FAILED"; fi
[ "$fail" = 0 ]
