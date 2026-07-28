#!/bin/sh
# Materialize the nginx LB->ECS TLS material and server block from the
# ECS-injected secret, then hand off to nginx (started by supervisord).
#
# ARCHITECTURE / SECRET PATH
# --------------------------
# The load balancer terminates the public TLS session and opens a SECOND, inner
# TLS session to the ECS task (LB -> ECS encryption in transit). nginx in the app
# container is the server for that inner session, so it needs a certificate +
# private key.
#
# The cert/key are stored in AWS Secrets Manager and delivered through the
# supported ECS mechanism: the task definition's container `secrets:` block maps
# the secret's JSON keys to ENVIRONMENT VARIABLES inside the container
# (valueFrom = <secret-arn>:<json-key>::). ECS never writes secrets to files, so
# this script converts the two env vars into the on-disk PEM files nginx's
# `ssl_certificate` / `ssl_certificate_key` directives require, with owner-only
# permissions, and writes them out of any world/other reach.
#
# Env contract (see deploy/docker/production/nginx/README.md for the secret shape
# and rotation/restart behavior):
#   NGINX_TLS_ENABLED           "true" enables the LB->ECS TLS path; anything else
#                               leaves the plain :8000 server as the only listener.
#   NGINX_SSL_CERTIFICATE       full-chain PEM (leaf + intermediates)   [required if enabled]
#   NGINX_SSL_CERTIFICATE_KEY   private-key PEM                          [required if enabled]
#
# SECURITY: this script never prints the certificate or (especially) the private
# key, never dumps the environment, and never uses `set -x`. Only sanitized
# metadata (paths, modes, byte counts, whether markers were found) is logged. The
# caller (entrypoint_portal.sh) unsets the two env vars before exec'ing
# supervisord so nginx/app workers never inherit the raw material.
set -eu

# Overridable paths (defaults are the in-container production locations; the
# tests point them at a throwaway tree).
SSL_DIR="${NGINX_SSL_DIR:-/etc/nginx/ssl}"
TLS_CONF="${NGINX_TLS_CONF:-/etc/nginx/conf.d/smaht_tls.conf}"
SERVER_COMMON="${NGINX_SERVER_COMMON:-/etc/nginx/conf.d/smaht_server_common.conf}"
TLS_LISTEN="${NGINX_TLS_LISTEN:-8443}"
CERT_FILE="$SSL_DIR/server.crt"
KEY_FILE="$SSL_DIR/server.key"

log() {
    echo "[nginx-tls] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

# Fail loudly + sanitized, non-zero so the container exits and ECS restarts it: a
# deployment that asked for TLS must NOT silently fall back to plaintext.
fail() {
    log "FAILED: $1"
    log "context: uid=$(id -u) gid=$(id -g) ssl_dir=$SSL_DIR tls_conf=$TLS_CONF"
    # Report only whether the vars were present and their sizes - never contents.
    log "context: NGINX_SSL_CERTIFICATE present=$( [ -n "${NGINX_SSL_CERTIFICATE:-}" ] && echo yes || echo no ) bytes=${_CERT_BYTES:-0}"
    log "context: NGINX_SSL_CERTIFICATE_KEY present=$( [ -n "${NGINX_SSL_CERTIFICATE_KEY:-}" ] && echo yes || echo no ) bytes=${_KEY_BYTES:-0}"
    exit 1
}

# ---------------------------------------------------------------------------
# Disabled path: ensure the include is empty and leave the plain server alone.
# ---------------------------------------------------------------------------
if [ "${NGINX_TLS_ENABLED:-false}" != "true" ]; then
    log "stage 'tls': NGINX_TLS_ENABLED is not 'true' - LB->ECS TLS disabled; nginx serves plain HTTP on :8000 only"
    mkdir -p "$(dirname "$TLS_CONF")"
    : > "$TLS_CONF"
    log "HEALTHY: TLS disabled; wrote empty $TLS_CONF"
    exit 0
fi

log "stage 'tls': NGINX_TLS_ENABLED=true - configuring LB->ECS TLS (listen ${TLS_LISTEN} ssl)"
log "context: uid=$(id -u) gid=$(id -g) ssl_dir=$SSL_DIR"

# ---------------------------------------------------------------------------
# Stage 1: read + validate the injected material (presence + PEM structure).
# ---------------------------------------------------------------------------
_CERT="${NGINX_SSL_CERTIFICATE:-}"
_KEY="${NGINX_SSL_CERTIFICATE_KEY:-}"
_CERT_BYTES=$(printf '%s' "$_CERT" | wc -c | tr -d ' ')
_KEY_BYTES=$(printf '%s' "$_KEY" | wc -c | tr -d ' ')

[ -n "$_CERT" ] || fail "NGINX_SSL_CERTIFICATE is empty/unset but TLS is enabled (check the ECS secrets mapping)"
[ -n "$_KEY" ]  || fail "NGINX_SSL_CERTIFICATE_KEY is empty/unset but TLS is enabled (check the ECS secrets mapping)"

# Structural PEM check (never prints the material). grep -q consumes no output.
printf '%s\n' "$_CERT" | grep -q -- '-----BEGIN CERTIFICATE-----' \
    || fail "NGINX_SSL_CERTIFICATE is not PEM (no BEGIN CERTIFICATE marker) - malformed secret"
printf '%s\n' "$_KEY" | grep -Eq -- '-----BEGIN ([A-Z0-9]+ )?PRIVATE KEY-----' \
    || fail "NGINX_SSL_CERTIFICATE_KEY is not a PEM private key (no BEGIN PRIVATE KEY marker) - malformed secret"

log "stage 'validate': cert bytes=$_CERT_BYTES key bytes=$_KEY_BYTES; PEM markers present"

# ---------------------------------------------------------------------------
# Stage 2: write owner-only files (umask 077 so nothing is group/other readable).
# ---------------------------------------------------------------------------
mkdir -p "$SSL_DIR"
chmod 700 "$SSL_DIR" 2>/dev/null || true
(
    umask 077
    printf '%s\n' "$_CERT" > "$CERT_FILE"
    printf '%s\n' "$_KEY"  > "$KEY_FILE"
)
chmod 600 "$CERT_FILE" "$KEY_FILE" 2>/dev/null || true
# shellcheck disable=SC2012  # fixed paths; report mode only, never contents
log "stage 'write': $CERT_FILE (mode $(ls -l "$CERT_FILE" | awk '{print $1}')) $KEY_FILE (mode $(ls -l "$KEY_FILE" | awk '{print $1}'))"

# ---------------------------------------------------------------------------
# Stage 3: optional deep validation (only if openssl is available). Confirms the
# cert and key parse AND that they belong together (public keys match). Output is
# discarded so no key material can leak; only the pass/fail verdict is logged.
# ---------------------------------------------------------------------------
if command -v openssl >/dev/null 2>&1; then
    if ! openssl x509 -in "$CERT_FILE" -noout >/dev/null 2>&1; then
        fail "openssl could not parse the certificate - malformed cert"
    fi
    if ! openssl pkey -in "$KEY_FILE" -noout >/dev/null 2>&1; then
        fail "openssl could not parse the private key - malformed key"
    fi
    _cert_pub="$(openssl x509 -in "$CERT_FILE" -noout -pubkey 2>/dev/null | openssl md5 2>/dev/null || true)"
    _key_pub="$(openssl pkey -in "$KEY_FILE" -pubout 2>/dev/null | openssl md5 2>/dev/null || true)"
    if [ -n "$_cert_pub" ] && [ "$_cert_pub" != "$_key_pub" ]; then
        fail "certificate and private key do not match (public keys differ) - wrong secret pairing"
    fi
    log "stage 'openssl-verify': cert + key parse and their public keys match"
else
    log "stage 'openssl-verify': openssl not present - skipped deep validation (structural check passed)"
fi

# ---------------------------------------------------------------------------
# Stage 4: write the TLS server block. It reuses the shared server body so it can
# never drift from the plain server. Modern protocols/ciphers only.
# ---------------------------------------------------------------------------
mkdir -p "$(dirname "$TLS_CONF")"
cat > "$TLS_CONF" <<EOF
# GENERATED by setup_nginx_tls.sh - do not edit by hand. Rewritten each boot.
# LB->ECS inner TLS server. Cert/key were materialized from the ECS-injected
# Secrets Manager secret into $SSL_DIR (owner-only).
server {
    listen $TLS_LISTEN ssl;

    ssl_certificate     $CERT_FILE;
    ssl_certificate_key $KEY_FILE;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    include $SERVER_COMMON;
}
EOF
log "stage 'write-conf': wrote TLS server block to $TLS_CONF (listen ${TLS_LISTEN} ssl)"

log "HEALTHY: LB->ECS TLS configured; nginx will listen ${TLS_LISTEN} ssl with cert=$CERT_FILE"
