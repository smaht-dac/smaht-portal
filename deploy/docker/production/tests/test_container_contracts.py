"""Static regression guards for the Sol-audit container/TLS fixes.

These invariants live in the Dockerfiles, nginx.conf, entrypoints, and the Splunk
sidecar config. Several of them (VOLUME semantics, the exec dispatch chain, the
SHA-256 pin) can only be *behaviorally* verified by building/running the images,
which needs Docker + the private base + the Splunk download -- unavailable in the
unit-test stack. This module asserts the checked-in text so a regression that
silently drops one of the fixes fails ``pytest`` / ``make test-unit`` immediately.

No Docker, network, AWS, Postgres, or ES required.
"""

import os
import re

import pytest

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))


def _read(rel):
    with open(os.path.join(REPO, rel), encoding="utf-8") as fh:
        return fh.read()


@pytest.mark.unit
def test_b2_app_image_declares_shared_log_volume():
    """B2: /var/log/smaht is a VOLUME so an ECS mount preserves the image path's
    nginx ownership/mode instead of masking it root:root 0755."""
    dockerfile = _read("Dockerfile")
    assert 'VOLUME ["/var/log/smaht"]' in dockerfile
    # The directory must be created + chowned nginx BEFORE the VOLUME declaration,
    # else the preserved content would not be nginx-owned.
    vol_idx = dockerfile.index('VOLUME ["/var/log/smaht"]')
    chown_idx = dockerfile.index("chown -R nginx:nginx /var/lib/nginx /var/log/smaht")
    assert chown_idx < vol_idx, "VOLUME must come after the /var/log/smaht chown"


@pytest.mark.unit
def test_b3_openssl_installed_and_build_gate_present():
    """B3: openssl is explicitly installed (deep cert/key validation is available),
    and the build-time nginx config gate runs."""
    dockerfile = _read("Dockerfile")
    assert re.search(r"apt-get install[^\n]*\bopenssl\b", dockerfile)
    assert "RUN nginx -v && nginx -t" in dockerfile


@pytest.mark.unit
def test_b3_setup_runs_nginx_t_before_healthy():
    """B3: setup_nginx_tls.sh runs the authoritative nginx -t and only logs HEALTHY
    after it passes (no HEALTHY for unparseable material)."""
    setup = _read("deploy/docker/production/setup_nginx_tls.sh")
    assert 'run_conftest' in setup
    assert '-t -c "$MAIN_CONF"' in setup
    # HEALTHY (enabled path) must appear after the final run_conftest call.
    last_conftest = setup.rindex("run_conftest")
    healthy = setup.rindex("HEALTHY: LB->ECS TLS configured")
    assert last_conftest < healthy


@pytest.mark.unit
def test_b4_nginx_conf_uses_generated_includes_for_fail_closed():
    """B4: nginx.conf serves via the generated http/tls includes (so TLS-enabled can
    drop the plaintext :8000 listener) rather than a hardcoded :8000 server."""
    nginx = _read("deploy/docker/production/nginx.conf")
    assert "include /etc/nginx/conf.d/smaht_http.conf;" in nginx
    assert "include /etc/nginx/conf.d/smaht_tls.conf;" in nginx
    # No hardcoded plaintext server left in the main file.
    assert "listen 8000;" not in nginx
    setup = _read("deploy/docker/production/setup_nginx_tls.sh")
    # Enabled path empties the http include (no plaintext listener).
    assert "write_http_disabled" in setup


@pytest.mark.unit
def test_b5_exec_dispatch_and_secret_scrub_order():
    """B5: the global entrypoint execs each role (PID 1 = role), and the portal
    entrypoint scrubs the TLS secret BEFORE assume_identity and execs supervisord."""
    glob = _read("deploy/docker/production/entrypoint.sh")
    for role in ("deployment", "ingester", "indexer", "portal", "local"):
        assert f"exec sh entrypoint_{role}.sh" in glob, f"{role} dispatch must exec"

    portal = _read("deploy/docker/production/entrypoint_portal.sh")
    unset_idx = portal.index("unset NGINX_SSL_CERTIFICATE NGINX_SSL_CERTIFICATE_KEY")
    # Order against the actual command invocation, not the earlier comment mention.
    assume_idx = portal.index("poetry run python -m assume_identity")
    assert unset_idx < assume_idx, "secret must be unset before assume_identity runs"
    assert "exec supervisord -c supervisord.conf" in portal


@pytest.mark.unit
def test_b6_nginx_logs_on_shared_volume_and_shipped():
    """B6: nginx access/error logs are written into the shared /var/log/smaht volume
    and the Splunk sidecar monitors them there (not an optional second volume)."""
    nginx = _read("deploy/docker/production/nginx.conf")
    assert "/var/log/smaht/nginx/error.log" in nginx
    assert "/var/log/smaht/nginx/access.log" in nginx
    inputs = _read("deploy/docker/splunk/inputs.conf")
    assert "/var/log/smaht/nginx/access.log" in inputs
    assert "/var/log/smaht/nginx/error.log" in inputs
    assert "/var/log/nginx/access.log" not in inputs, "must not depend on a separate nginx volume"


@pytest.mark.unit
def test_n3_sidecar_pins_and_verifies_splunk_download():
    """N3: the sidecar image verifies the Splunk deb SHA-256 before extraction."""
    dockerfile = _read("deploy/docker/splunk/Dockerfile")
    assert "ARG SPLUNK_UF_SHA256=" in dockerfile
    assert 'sha256sum -c -' in dockerfile
    # The pinned hash is the 64-hex-char value verified from download.splunk.com.
    m = re.search(r"ARG SPLUNK_UF_SHA256=([0-9a-f]{64})", dockerfile)
    assert m, "SPLUNK_UF_SHA256 must pin a 64-hex-char sha256"


@pytest.mark.unit
def test_n1_sidecar_traps_installed_before_first_splunk_command():
    """N1: graceful-shutdown traps are installed before the license/start stages, and
    the stop is bounded."""
    entry = _read("deploy/docker/splunk/entrypoint.sh")
    trap_idx = entry.index("trap 'shutdown' INT TERM")
    version_stage_idx = entry.index('run_splunk "version" version')
    assert trap_idx < version_stage_idx, "traps must be installed before the first splunk call"
    assert "bounded_splunk_stop" in entry
    assert "STOP_TIMEOUT" in entry
