#!/bin/sh
# Materialize the nginx LB->ECS TLS material + server blocks from the ECS-injected
# secret, VALIDATE the whole config with `nginx -t`, then hand off to nginx
# (started by supervisord).
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
# FAIL CLOSED (B4): nginx serves EITHER plaintext :8000 (TLS disabled) OR TLS
# :8443 (TLS enabled) -- never both. The two server blocks are generated into
# includes: when TLS is enabled the plaintext http include is emptied, so no
# plaintext :8000 listener exists at all.
#
# AUTHORITATIVE VALIDATION (B3): after materialization this runs the real
# `nginx -t` against the actual nginx.conf. That loads the cert/key and parses the
# whole config, so marker-shaped-but-invalid material, a mismatched key, or any
# include/config error fails HERE (non-zero exit -> the container fails to start
# and ECS restarts it) instead of surfacing later as an nginx restart loop. HEALTHY
# is only logged AFTER nginx -t passes.
#
# Env contract (see deploy/docker/production/nginx/README.md for the secret shape
# and rotation/restart behavior):
#   NGINX_TLS_ENABLED           "true" enables the LB->ECS TLS path (listen 8443 ssl,
#                               plaintext :8000 removed); anything else = plain :8000.
#   NGINX_SSL_CERTIFICATE       full-chain PEM (leaf + intermediates)   [required if enabled]
#   NGINX_SSL_CERTIFICATE_KEY   private-key PEM                          [required if enabled]
#
# SECURITY: this script never prints the certificate or (especially) the private
# key, never dumps the environment, and never uses `set -x`. Only sanitized
# metadata (paths, modes, byte counts, whether markers were found) is logged, and
# any captured nginx -t output is passed through a redactor. The caller
# (entrypoint_portal.sh) unsets the two env vars BEFORE running any other helper
# and before exec'ing supervisord, so nothing downstream inherits the raw material.
set -eu

# Overridable paths (defaults are the in-container production locations; the
# tests point them at a throwaway tree).
SSL_DIR="${NGINX_SSL_DIR:-/etc/nginx/ssl}"
HTTP_CONF="${NGINX_HTTP_CONF:-/etc/nginx/conf.d/smaht_http.conf}"
TLS_CONF="${NGINX_TLS_CONF:-/etc/nginx/conf.d/smaht_tls.conf}"
SERVER_COMMON="${NGINX_SERVER_COMMON:-/etc/nginx/conf.d/smaht_server_common.conf}"
HTTP_LISTEN="${NGINX_HTTP_LISTEN:-8000}"
TLS_LISTEN="${NGINX_TLS_LISTEN:-8443}"
MAIN_CONF="${NGINX_MAIN_CONF:-/etc/nginx/nginx.conf}"
NGINX_BIN="${NGINX_BIN:-$(command -v nginx 2>/dev/null || echo /usr/sbin/nginx)}"
CERT_FILE="$SSL_DIR/server.crt"
KEY_FILE="$SSL_DIR/server.key"

log() {
    echo "[nginx-tls] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

# Permission mode of a path, as a stable string across platforms. macOS `ls`
# appends `@` for extended attributes - which do NOT change permissions, and
# which macOS 14 adds (com.apple.provenance) to ordinary files - so the raw
# string is platform-dependent. Only that `@` is stripped; the `+` marker (an
# ACL, and what GNU ls reports for extended security) is deliberately kept,
# because an ACL can widen effective access and must stay visible.
# shellcheck disable=SC2012  # fixed paths; mode field only, never contents
mode_of() {
    ls -l "$1" 2>/dev/null | awk '{print $1}' | sed 's/@$//'
}

# Redact anything key/secret-shaped from captured tool output (defensive: nginx -t
# does not print key bytes, but a future directive/error might echo a value).
redact() {
    sed -E \
      -e 's/(-----BEGIN[[:alnum:] ]*PRIVATE KEY-----).*/\1<redacted>/' \
      -e 's/(([Pp]ass[A-Za-z0-9_]*|PASSWORD|[Ss]ecret[A-Za-z0-9_]*|[Tt]oken[A-Za-z0-9_]*|ssl_certificate_key)[[:space:]]*[=:]?[[:space:]]*).+/\1<redacted>/g'
}

# Fail loudly + sanitized, non-zero so the container exits and ECS restarts it: a
# deployment that asked for TLS must NOT silently fall back to plaintext.
fail() {
    log "FAILED: $1"
    log "context: uid=$(id -u) gid=$(id -g) ssl_dir=$SSL_DIR http_conf=$HTTP_CONF tls_conf=$TLS_CONF"
    log "context: NGINX_SSL_CERTIFICATE present=$( [ -n "${NGINX_SSL_CERTIFICATE:-}" ] && echo yes || echo no ) bytes=${_CERT_BYTES:-0}"
    log "context: NGINX_SSL_CERTIFICATE_KEY present=$( [ -n "${NGINX_SSL_CERTIFICATE_KEY:-}" ] && echo yes || echo no ) bytes=${_KEY_BYTES:-0}"
    exit 1
}

# Write the plain HTTP (:8000) server include.
write_http_server() {
    mkdir -p "$(dirname "$HTTP_CONF")"
    cat > "$HTTP_CONF" <<EOF
# GENERATED by setup_nginx_tls.sh - do not edit by hand. Rewritten each boot.
# Plain HTTP server (TLS disabled): the LB->ECS hop is plaintext.
server {
    listen $HTTP_LISTEN;
    include $SERVER_COMMON;
}
EOF
}

# Empty the plain HTTP include so there is NO plaintext listener (fail closed).
write_http_disabled() {
    mkdir -p "$(dirname "$HTTP_CONF")"
    cat > "$HTTP_CONF" <<EOF
# GENERATED by setup_nginx_tls.sh - do not edit by hand. Rewritten each boot.
# TLS is ENABLED, so the plaintext :$HTTP_LISTEN listener is intentionally removed
# (fail closed): nginx serves ONLY the TLS server on :$TLS_LISTEN (smaht_tls.conf).
EOF
}

# Run the authoritative nginx config test against the real nginx.conf. This loads
# the cert/key and parses every include, so it is the real gate on validity.
run_conftest() {
    _ct="$(mktemp "${TMPDIR:-/tmp}/nginx-conftest.XXXXXX")"
    if "$NGINX_BIN" -t -c "$MAIN_CONF" >"$_ct" 2>&1; then
        log "stage 'nginx-conftest': '$NGINX_BIN -t' accepted $MAIN_CONF"
        rm -f "$_ct"
    else
        log "stage 'nginx-conftest': '$NGINX_BIN -t' REJECTED $MAIN_CONF (redacted output below)"
        redact < "$_ct" | sed 's/^/[nginx -t] /' | tail -n 30
        rm -f "$_ct"
        fail "nginx -t rejected the generated configuration"
    fi
}

# ---------------------------------------------------------------------------
# Disabled path: plaintext :8000 only. Still validated by nginx -t.
# ---------------------------------------------------------------------------
if [ "${NGINX_TLS_ENABLED:-false}" != "true" ]; then
    log "stage 'tls': NGINX_TLS_ENABLED is not 'true' - LB->ECS TLS disabled; nginx serves plain HTTP on :$HTTP_LISTEN only"
    write_http_server
    mkdir -p "$(dirname "$TLS_CONF")"
    : > "$TLS_CONF"
    run_conftest
    log "HEALTHY: TLS disabled; plain :$HTTP_LISTEN server active, empty $TLS_CONF, config validated"
    exit 0
fi

log "stage 'tls': NGINX_TLS_ENABLED=true - configuring LB->ECS TLS (listen ${TLS_LISTEN} ssl; plaintext :$HTTP_LISTEN removed)"
log "context: uid=$(id -u) gid=$(id -g) ssl_dir=$SSL_DIR nginx=$NGINX_BIN"

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
log "stage 'write': $CERT_FILE (mode $(mode_of "$CERT_FILE")) $KEY_FILE (mode $(mode_of "$KEY_FILE"))"

# ---------------------------------------------------------------------------
# Stage 3: deep validation when openssl is available (defense in depth). Confirms
# the cert and key parse AND that they belong together (public keys match) before
# nginx even sees them. When openssl is absent this is skipped, but the
# authoritative nginx -t below still loads the cert/key and would reject a bad or
# mismatched pair -- so validity is guaranteed either way.
# ---------------------------------------------------------------------------
if command -v openssl >/dev/null 2>&1; then
    openssl x509 -in "$CERT_FILE" -noout >/dev/null 2>&1 \
        || fail "openssl could not parse the certificate - malformed cert"
    openssl pkey -in "$KEY_FILE" -noout >/dev/null 2>&1 \
        || fail "openssl could not parse the private key - malformed key"
    _cert_pub="$(openssl x509 -in "$CERT_FILE" -noout -pubkey 2>/dev/null | openssl md5 2>/dev/null || true)"
    _key_pub="$(openssl pkey -in "$KEY_FILE" -pubout 2>/dev/null | openssl md5 2>/dev/null || true)"
    if [ -n "$_cert_pub" ] && [ "$_cert_pub" != "$_key_pub" ]; then
        fail "certificate and private key do not match (public keys differ) - wrong secret pairing"
    fi
    log "stage 'openssl-verify': cert + key parse and their public keys match"
else
    log "stage 'openssl-verify': openssl absent - relying on the authoritative nginx -t below to load/verify the cert+key"
fi

# ---------------------------------------------------------------------------
# Stage 4: write the TLS server block + remove the plaintext listener (fail closed).
# The TLS server reuses the shared server body so it cannot drift from the plain one.
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
write_http_disabled
log "stage 'write-conf': wrote TLS server ($TLS_CONF, listen ${TLS_LISTEN} ssl) and emptied plaintext $HTTP_CONF (fail closed)"

# ---------------------------------------------------------------------------
# Stage 5: AUTHORITATIVE validation - nginx -t loads the cert/key + parses all of
# nginx.conf. HEALTHY only after this passes.
# ---------------------------------------------------------------------------
run_conftest

log "HEALTHY: LB->ECS TLS configured; nginx will listen ${TLS_LISTEN} ssl (plaintext :$HTTP_LISTEN removed) with cert=$CERT_FILE"
