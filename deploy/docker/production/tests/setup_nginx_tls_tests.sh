#!/bin/sh
# Regression tests for setup_nginx_tls.sh (the LB->ECS TLS materialization).
#
# Self-contained: no real AWS, no Secrets Manager, no network. Each case sets the
# NGINX_SSL_CERTIFICATE[_KEY] env vars the way the ECS `secrets:` block would,
# points the script's paths at a throwaway tree, runs the real script, and
# asserts on the captured output, exit code, file modes, and generated config.
#
# Run directly:  sh deploy/docker/production/tests/setup_nginx_tls_tests.sh
# Exit 0 = all cases passed.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
PROD="$(cd "$HERE/.." && pwd)"
SCRIPT="$PROD/setup_nginx_tls.sh"
SERVER_COMMON_SRC="$PROD/nginx/smaht_server_common.conf"

PASS=0
FAIL=0
ok()  { echo "  ok: $1"; PASS=$((PASS + 1)); }
bad() {
    echo "  FAIL: $1"; FAIL=$((FAIL + 1))
    echo "  ---- output was ----"; sed 's/^/    | /' "$RUN_OUT"; echo "  --------------------"
}
want()    { if grep -Fq -- "$2" "$RUN_OUT"; then ok "$1"; else bad "$1"; fi; }
wantnot() { if grep -Fq -- "$2" "$RUN_OUT"; then bad "$1"; else ok "$1"; fi; }
want_rc_zero()    { if [ "$RUN_RC" = 0 ]; then ok "$1"; else bad "$1"; fi; }
want_rc_nonzero() { if [ "$RUN_RC" != 0 ]; then ok "$1"; else bad "$1"; fi; }
# Assert against the GENERATED TLS include file (not the script's stdout).
want_conf() { if grep -Fq -- "$2" "$NGINX_TLS_CONF" 2>/dev/null; then ok "$1"; else bad "$1"; fi; }

HAVE_OPENSSL=0
command -v openssl >/dev/null 2>&1 && HAVE_OPENSSL=1
HAVE_NGINX=0
command -v nginx >/dev/null 2>&1 && HAVE_NGINX=1

# Generate a valid self-signed cert/key pair (once) plus a second, unrelated key
# for the mismatch case. Skipped when openssl is unavailable.
CERT_PEM=""; KEY_PEM=""; OTHER_KEY_PEM=""
if [ "$HAVE_OPENSSL" = 1 ]; then
    GEN="$(mktemp -d "${TMPDIR:-/tmp}/tls-gen.XXXXXX")"
    openssl req -x509 -newkey rsa:2048 -keyout "$GEN/key.pem" -out "$GEN/cert.pem" \
        -days 2 -nodes -subj "/CN=smaht-portal.test" >/dev/null 2>&1
    openssl genrsa -out "$GEN/other.pem" 2048 >/dev/null 2>&1
    CERT_PEM="$(cat "$GEN/cert.pem")"
    KEY_PEM="$(cat "$GEN/key.pem")"
    OTHER_KEY_PEM="$(cat "$GEN/other.pem")"
    rm -rf "$GEN"
fi

# Run setup_nginx_tls.sh in a throwaway tree.
#   $1 enabled : true | false
#   env NGINX_SSL_CERTIFICATE / NGINX_SSL_CERTIFICATE_KEY set by caller
run_case() {
    _enabled="$1"
    WORK="$(mktemp -d "${TMPDIR:-/tmp}/tls-test.XXXXXX")"
    export NGINX_SSL_DIR="$WORK/ssl"
    export NGINX_TLS_CONF="$WORK/conf.d/smaht_tls.conf"
    export NGINX_SERVER_COMMON="$WORK/conf.d/smaht_server_common.conf"
    export NGINX_TLS_LISTEN=8443
    export NGINX_TLS_ENABLED="$_enabled"
    mkdir -p "$WORK/conf.d"
    cp "$SERVER_COMMON_SRC" "$NGINX_SERVER_COMMON"
    RUN_OUT="$(mktemp "${TMPDIR:-/tmp}/tls-out.XXXXXX")"
    sh "$SCRIPT" >"$RUN_OUT" 2>&1
    RUN_RC=$?
    LAST_WORK="$WORK"
}

# shellcheck disable=SC2012  # fixed test paths (no odd filenames); ls mode field is fine
perm_of() { ls -l "$1" 2>/dev/null | awk '{print $1}'; }

# ---------------------------------------------------------------------------
echo "TEST 1: TLS disabled -> empty include, healthy, no ssl server"
unset NGINX_SSL_CERTIFICATE NGINX_SSL_CERTIFICATE_KEY 2>/dev/null || true
run_case false
want_rc_zero "exits zero when disabled"
want    "logs TLS disabled"          "LB->ECS TLS disabled"
wantnot "no ssl listener generated"  "listen 8443 ssl"
if [ -s "$NGINX_TLS_CONF" ]; then bad "tls include is empty when disabled"; else ok "tls include is empty when disabled"; fi
rm -rf "$LAST_WORK"

echo "TEST 2: enabled + missing cert env -> fails loudly, names the var, non-zero"
unset NGINX_SSL_CERTIFICATE 2>/dev/null || true
export NGINX_SSL_CERTIFICATE_KEY="dummy"
run_case true
want_rc_nonzero "exits non-zero on missing cert"
want            "names NGINX_SSL_CERTIFICATE" "NGINX_SSL_CERTIFICATE is empty"
wantnot         "does not claim HEALTHY"      "HEALTHY: LB->ECS TLS configured"
rm -rf "$LAST_WORK"

echo "TEST 3: enabled + missing key env -> fails loudly, names the var, non-zero"
export NGINX_SSL_CERTIFICATE="-----BEGIN CERTIFICATE-----
MIIB
-----END CERTIFICATE-----"
unset NGINX_SSL_CERTIFICATE_KEY 2>/dev/null || true
run_case true
want_rc_nonzero "exits non-zero on missing key"
want            "names NGINX_SSL_CERTIFICATE_KEY" "NGINX_SSL_CERTIFICATE_KEY is empty"
rm -rf "$LAST_WORK"

echo "TEST 4: enabled + malformed cert (not PEM) -> fails loudly, non-zero"
export NGINX_SSL_CERTIFICATE="this is not a certificate"
export NGINX_SSL_CERTIFICATE_KEY="-----BEGIN PRIVATE KEY-----
AA
-----END PRIVATE KEY-----"
run_case true
want_rc_nonzero "exits non-zero on malformed cert"
want            "reports not PEM cert" "NGINX_SSL_CERTIFICATE is not PEM"
rm -rf "$LAST_WORK"

echo "TEST 5: enabled + malformed key (not PEM) -> fails loudly, non-zero"
export NGINX_SSL_CERTIFICATE="-----BEGIN CERTIFICATE-----
MIIB
-----END CERTIFICATE-----"
export NGINX_SSL_CERTIFICATE_KEY="oops not a key"
run_case true
want_rc_nonzero "exits non-zero on malformed key"
want            "reports not PEM key" "NGINX_SSL_CERTIFICATE_KEY is not a PEM private key"
rm -rf "$LAST_WORK"

if [ "$HAVE_OPENSSL" = 1 ]; then
    echo "TEST 6: enabled + valid cert/key -> healthy, files 0600, ssl server generated"
    export NGINX_SSL_CERTIFICATE="$CERT_PEM"
    export NGINX_SSL_CERTIFICATE_KEY="$KEY_PEM"
    run_case true
    want_rc_zero "exits zero on valid material"
    want    "reaches HEALTHY"                 "HEALTHY: LB->ECS TLS configured"
    want_conf "generates ssl listener"        "listen 8443 ssl"
    want_conf "references cert path"          "ssl_certificate"
    want_conf "includes shared server body"   "smaht_server_common.conf"
    if [ "$(perm_of "$NGINX_SSL_DIR/server.crt")" = "-rw-------" ]; then ok "cert file is 0600"; else bad "cert file is 0600 (got $(perm_of "$NGINX_SSL_DIR/server.crt"))"; fi
    if [ "$(perm_of "$NGINX_SSL_DIR/server.key")" = "-rw-------" ]; then ok "key file is 0600"; else bad "key file is 0600 (got $(perm_of "$NGINX_SSL_DIR/server.key"))"; fi
    want    "openssl verify ran"              "cert + key parse and their public keys match"
    echo "TEST 7: secret material is never echoed to stdout/stderr"
    wantnot "no PEM body markers in output"   "-----BEGIN"
    # nginx -t validates the generated block + that the cert/key actually load.
    if [ "$HAVE_NGINX" = 1 ]; then
        echo "TEST 8: generated TLS block validates with 'nginx -t'"
        WRAP="$(mktemp -d "${TMPDIR:-/tmp}/tls-nginx.XXXXXX")"
        cat > "$WRAP/nginx.conf" <<EOF
error_log stderr crit;
pid $WRAP/nginx.pid;
events { worker_connections 64; }
http {
    upstream app { server 127.0.0.1:6543; }
    include $NGINX_TLS_CONF;
}
EOF
        NGX_OUT="$(mktemp "${TMPDIR:-/tmp}/ngx.XXXXXX")"
        nginx -t -c "$WRAP/nginx.conf" >"$NGX_OUT" 2>&1
        NGX_RC=$?
        if [ "$NGX_RC" = 0 ]; then ok "nginx -t accepts the generated config"; else
            echo "  FAIL: nginx -t rejected the generated config"; FAIL=$((FAIL + 1))
            sed 's/^/    | /' "$NGX_OUT"
        fi
        rm -rf "$WRAP" "$NGX_OUT"
    else
        echo "TEST 8: SKIPPED (nginx not installed)"
    fi
    rm -rf "$LAST_WORK"

    echo "TEST 9: enabled + mismatched cert/key -> fails loudly, non-zero"
    export NGINX_SSL_CERTIFICATE="$CERT_PEM"
    export NGINX_SSL_CERTIFICATE_KEY="$OTHER_KEY_PEM"
    run_case true
    want_rc_nonzero "exits non-zero on cert/key mismatch"
    want            "reports mismatch" "do not match"
    rm -rf "$LAST_WORK"
else
    echo "TESTS 6-9: SKIPPED (openssl not installed - cannot mint test certs)"
fi

unset NGINX_SSL_CERTIFICATE NGINX_SSL_CERTIFICATE_KEY 2>/dev/null || true

# The nginx.conf refactor moved the server body into smaht_server_common.conf,
# included by the plain :8000 server. Validate that plain-server-plus-snippet
# combination directly (a minimal wrapper, like TEST 8 does for the TLS server),
# so the check exercises OUR change without depending on the many build-tuned
# directives in the full production nginx.conf that differ across nginx versions
# (epoll, upstream zone sizing, etc.).
if [ "$HAVE_NGINX" = 1 ]; then
    echo "TEST 10: plain :8000 server + shared snippet validates with 'nginx -t'"
    W="$(mktemp -d "${TMPDIR:-/tmp}/main-nginx.XXXXXX")"
    cp "$SERVER_COMMON_SRC" "$W/smaht_server_common.conf"
    cat > "$W/nginx.conf" <<EOF
error_log stderr crit;
pid $W/nginx.pid;
events { worker_connections 64; }
http {
    upstream app { server 127.0.0.1:6543; }
    server {
        listen 8000;
        include $W/smaht_server_common.conf;
    }
}
EOF
    NGX_OUT="$(mktemp "${TMPDIR:-/tmp}/ngx-main.XXXXXX")"
    if nginx -t -c "$W/nginx.conf" >"$NGX_OUT" 2>&1; then
        ok "nginx -t accepts the plain server + shared snippet"
    else
        echo "  FAIL: nginx -t rejected the plain server + snippet"; FAIL=$((FAIL + 1))
        sed 's/^/    | /' "$NGX_OUT"
    fi
    rm -rf "$W" "$NGX_OUT"
else
    echo "TEST 10: SKIPPED (nginx not installed)"
fi

echo
echo "==================================================================="
echo "PASSED: $PASS   FAILED: $FAIL"
echo "==================================================================="
[ "$FAIL" -eq 0 ]
