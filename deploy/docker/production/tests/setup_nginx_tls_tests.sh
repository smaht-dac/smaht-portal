#!/bin/sh
# Regression tests for setup_nginx_tls.sh (the LB->ECS TLS materialization).
#
# Self-contained: no real AWS, no Secrets Manager, no network. Each case sets the
# NGINX_SSL_CERTIFICATE[_KEY] env vars the way the ECS `secrets:` block would,
# points the script's paths at a throwaway tree with a REAL wrapper nginx.conf, runs
# the real script, and asserts on output, exit code, file modes, the generated
# http/tls includes, and that the script's own `nginx -t` gate ran.
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
want()      { if grep -Fq -- "$2" "$RUN_OUT"; then ok "$1"; else bad "$1"; fi; }
wantnot()   { if grep -Fq -- "$2" "$RUN_OUT"; then bad "$1"; else ok "$1"; fi; }
want_rc_zero()    { if [ "$RUN_RC" = 0 ]; then ok "$1"; else bad "$1"; fi; }
want_rc_nonzero() { if [ "$RUN_RC" != 0 ]; then ok "$1"; else bad "$1"; fi; }
want_file()    { if grep -Fq -- "$3" "$2" 2>/dev/null; then ok "$1"; else bad "$1"; fi; }
wantnot_file() { if grep -Fq -- "$3" "$2" 2>/dev/null; then bad "$1"; else ok "$1"; fi; }
# shellcheck disable=SC2012  # fixed test paths; ls mode field is fine
perm_of() { ls -l "$1" 2>/dev/null | awk '{print $1}'; }

HAVE_OPENSSL=0; command -v openssl >/dev/null 2>&1 && HAVE_OPENSSL=1
HAVE_NGINX=0;   command -v nginx   >/dev/null 2>&1 && HAVE_NGINX=1

if [ "$HAVE_NGINX" != 1 ]; then
    echo "SKIP: nginx binary not found - setup_nginx_tls.sh's authoritative nginx -t"
    echo "      gate cannot be exercised here. Install nginx to run these tests."
    exit 0
fi

# Mint a valid self-signed cert/key (once) + a second unrelated key for mismatch.
CERT_PEM=""; KEY_PEM=""; OTHER_KEY_PEM=""
if [ "$HAVE_OPENSSL" = 1 ]; then
    GEN="$(mktemp -d "${TMPDIR:-/tmp}/tls-gen.XXXXXX")"
    openssl req -x509 -newkey rsa:2048 -keyout "$GEN/key.pem" -out "$GEN/cert.pem" \
        -days 2 -nodes -subj "/CN=smaht-portal.test" >/dev/null 2>&1
    openssl genrsa -out "$GEN/other.pem" 2048 >/dev/null 2>&1
    CERT_PEM="$(cat "$GEN/cert.pem")"; KEY_PEM="$(cat "$GEN/key.pem")"
    OTHER_KEY_PEM="$(cat "$GEN/other.pem")"
    rm -rf "$GEN"
fi

# Build a throwaway tree with a REAL wrapper nginx.conf that includes the generated
# http/tls includes, so setup_nginx_tls.sh's `nginx -t -c MAIN_CONF` actually runs.
setup_work() {
    WORK="$(mktemp -d "${TMPDIR:-/tmp}/tls-test.XXXXXX")"
    mkdir -p "$WORK/conf.d" "$WORK/ssl"
    cp "$SERVER_COMMON_SRC" "$WORK/conf.d/smaht_server_common.conf"
    : > "$WORK/conf.d/smaht_http.conf"
    : > "$WORK/conf.d/smaht_tls.conf"
    cat > "$WORK/nginx.conf" <<EOF
error_log stderr crit;
pid $WORK/nginx.pid;
events { worker_connections 64; }
http {
    upstream app { server 127.0.0.1:6543; }
    include $WORK/conf.d/smaht_http.conf;
    include $WORK/conf.d/smaht_tls.conf;
}
EOF
    export NGINX_SSL_DIR="$WORK/ssl"
    export NGINX_HTTP_CONF="$WORK/conf.d/smaht_http.conf"
    export NGINX_TLS_CONF="$WORK/conf.d/smaht_tls.conf"
    export NGINX_SERVER_COMMON="$WORK/conf.d/smaht_server_common.conf"
    export NGINX_MAIN_CONF="$WORK/nginx.conf"
    export NGINX_HTTP_LISTEN=8000
    export NGINX_TLS_LISTEN=8443
}

# Run setup_nginx_tls.sh. $1 = enabled (true|false); $2 = "hide-openssl" (optional).
run_case() {
    setup_work
    export NGINX_TLS_ENABLED="$1"
    RUN_OUT="$(mktemp "${TMPDIR:-/tmp}/tls-out.XXXXXX")"
    if [ "${2:-}" = "hide-openssl" ]; then
        # Curated PATH containing every external command setup_nginx_tls.sh needs
        # EXCEPT openssl, so `command -v openssl` fails and the nginx -t gate is the
        # only validator (proves B3: invalid material is caught even without openssl).
        CBIN="$WORK/curated-bin"; mkdir -p "$CBIN"
        for t in date id wc tr grep mkdir chmod ls awk sed cat rm mktemp dirname nginx sh; do
            _p="$(command -v "$t" 2>/dev/null)" && ln -sf "$_p" "$CBIN/$t"
        done
        PATH="$CBIN" sh "$SCRIPT" >"$RUN_OUT" 2>&1
    else
        sh "$SCRIPT" >"$RUN_OUT" 2>&1
    fi
    RUN_RC=$?
    LAST_WORK="$WORK"
}

# ---------------------------------------------------------------------------
echo "TEST 1: TLS disabled -> plain :8000 include, empty tls, nginx -t ran, healthy"
unset NGINX_SSL_CERTIFICATE NGINX_SSL_CERTIFICATE_KEY 2>/dev/null || true
run_case false
want_rc_zero "exits zero when disabled"
want      "logs TLS disabled"                 "LB->ECS TLS disabled"
want      "runs the authoritative nginx -t"   "nginx-conftest"
want      "reaches HEALTHY"                    "HEALTHY: TLS disabled"
want_file "http include has plain :8000"       "$NGINX_HTTP_CONF" "listen 8000"
if [ -s "$NGINX_TLS_CONF" ]; then bad "tls include empty when disabled"; else ok "tls include empty when disabled"; fi
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
    echo "TEST 6: enabled + valid cert/key -> healthy, 0600 files, TLS server, FAIL-CLOSED http"
    export NGINX_SSL_CERTIFICATE="$CERT_PEM"
    export NGINX_SSL_CERTIFICATE_KEY="$KEY_PEM"
    run_case true
    want_rc_zero  "exits zero on valid material"
    want          "reaches HEALTHY"                  "HEALTHY: LB->ECS TLS configured"
    want          "authoritative nginx -t accepted"  "nginx-conftest': '"
    want_file     "tls include: listen 8443 ssl"     "$NGINX_TLS_CONF" "listen 8443 ssl"
    want_file     "tls include references cert"      "$NGINX_TLS_CONF" "ssl_certificate"
    want_file     "tls include shares server body"   "$NGINX_TLS_CONF" "smaht_server_common.conf"
    wantnot_file  "B4: http include has NO :8000"    "$NGINX_HTTP_CONF" "listen 8000"
    if [ "$(perm_of "$NGINX_SSL_DIR/server.crt")" = "-rw-------" ]; then ok "cert file is 0600"; else bad "cert 0600 (got $(perm_of "$NGINX_SSL_DIR/server.crt"))"; fi
    if [ "$(perm_of "$NGINX_SSL_DIR/server.key")" = "-rw-------" ]; then ok "key file is 0600";  else bad "key 0600 (got $(perm_of "$NGINX_SSL_DIR/server.key"))"; fi
    want          "openssl verify ran"               "cert + key parse and their public keys match"
    echo "TEST 7: secret material is never echoed to stdout/stderr"
    wantnot "no PEM body markers in output" "-----BEGIN"
    rm -rf "$LAST_WORK"

    echo "TEST 8: enabled + mismatched cert/key -> fails loudly, non-zero"
    export NGINX_SSL_CERTIFICATE="$CERT_PEM"
    export NGINX_SSL_CERTIFICATE_KEY="$OTHER_KEY_PEM"
    run_case true
    want_rc_nonzero "exits non-zero on cert/key mismatch"
    want            "reports mismatch" "do not match"
    rm -rf "$LAST_WORK"

    echo "TEST 9 (B3): marker-shaped garbage with NO openssl -> nginx -t catches it, non-zero"
    # cert/key carry the right BEGIN markers (structural check passes) but are not
    # loadable. With openssl hidden, ONLY the authoritative nginx -t can catch it.
    export NGINX_SSL_CERTIFICATE="-----BEGIN CERTIFICATE-----
bm90LXJlYWxseS1hLWNlcnQ=
-----END CERTIFICATE-----"
    export NGINX_SSL_CERTIFICATE_KEY="-----BEGIN PRIVATE KEY-----
bm90LXJlYWxseS1hLWtleQ==
-----END PRIVATE KEY-----"
    run_case true hide-openssl
    want    "took the no-openssl path"             "openssl absent"
    want    "nginx -t REJECTED the config"         "REJECTED"
    want_rc_nonzero "exits non-zero on invalid material even without openssl"
    wantnot "no false HEALTHY on invalid material" "HEALTHY: LB->ECS TLS configured"
    rm -rf "$LAST_WORK"

    echo "TEST 10 (B3): valid material with NO openssl -> nginx -t accepts, healthy"
    export NGINX_SSL_CERTIFICATE="$CERT_PEM"
    export NGINX_SSL_CERTIFICATE_KEY="$KEY_PEM"
    run_case true hide-openssl
    want    "took the no-openssl path"  "openssl absent"
    want    "reaches HEALTHY"           "HEALTHY: LB->ECS TLS configured"
    want_rc_zero "exits zero"
    rm -rf "$LAST_WORK"
else
    echo "TESTS 6-10: SKIPPED (openssl not installed - cannot mint test certs)"
fi

unset NGINX_SSL_CERTIFICATE NGINX_SSL_CERTIFICATE_KEY 2>/dev/null || true

echo
echo "==================================================================="
echo "PASSED: $PASS   FAILED: $FAIL"
echo "==================================================================="
[ "$FAIL" -eq 0 ]
