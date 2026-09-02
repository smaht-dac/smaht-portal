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
import shlex
import subprocess
import time

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
    # /var/log/smaht must be created + chowned nginx BEFORE the VOLUME declaration,
    # else the preserved content would not be nginx-owned. Match a `chown -R
    # nginx:nginx ... /var/log/smaht` line (robust to other paths on that line)
    # occurring before the VOLUME.
    vol_idx = dockerfile.index('VOLUME ["/var/log/smaht"]')
    before_volume = dockerfile[:vol_idx]
    assert re.search(r"chown -R nginx:nginx[^\n]*/var/log/smaht", before_volume), \
        "VOLUME must come after a chown -R nginx:nginx of /var/log/smaht"


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
def test_log_shipper_quietly_tails_all_app_files(tmp_path):
    """Multi-file tail must keep application lines without emitting file headers."""
    supervisord = _read("deploy/docker/production/supervisord.conf")
    command = next(
        line for line in supervisord.splitlines()
        if line.startswith("command=tail ")
    )
    assert command.startswith("command=tail -q -n0 -F ")
    assert command.count("/var/log/smaht/smaht") == 5

    tail_args = shlex.split(command.removeprefix("command="))
    file_start = tail_args.index("-F") + 1
    log_paths = [
        os.path.join(str(tmp_path), f"smaht{index}.log")
        for index in range(1, 6)
    ]
    for log_path in log_paths:
        with open(log_path, "w"):
            pass
    tail_args[file_start:] = log_paths

    process = subprocess.Popen(
        tail_args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        time.sleep(0.2)
        with open(log_paths[1], "a") as log_file:
            log_file.write('{"message":"synthetic application event"}\n')
        with open(log_paths[3], "a") as log_file:
            log_file.write('{"message":"synthetic second event"}\n')
        time.sleep(0.2)
    finally:
        process.terminate()
        output, _ = process.communicate(timeout=2)

    assert '"message":"synthetic application event"' in output
    assert '"message":"synthetic second event"' in output
    assert "==> " not in output


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


# ---------------------------------------------------------------------------
# Okta configuration is rendered once, at container startup, into production.ini
# ---------------------------------------------------------------------------

OKTA_TEMPLATE = "deploy/docker/production/smaht_any_alpha.ini"

# The exact dcicutils release that binds the four OKTA_* template substitutions.
# Pinned exactly (not caret-ranged) because it is a pre-release.
REQUIRED_DCICUTILS_VERSION = "8.19.0.1b1"


def _render_template(**okta_env):
    """Render the production template the way ``assume_identity`` does.

    ``deploy/docker/production/assume_identity.py`` reads the Secrets Manager
    identity and expands the template under ``override_environ``; here the
    identity is simulated by the passed environment, so no AWS is involved.
    A value of ``None`` means the identity did not supply that key at all.
    """
    import io

    from dcicutils.deployment_utils import BasicOrchestratedSMAHTIniFileManager
    from dcicutils.misc_utils import override_environ

    class _Manager(BasicOrchestratedSMAHTIniFileManager):
        TEMPLATE_DIR = os.path.join(REPO, "deploy", "ini_files")
        PYPROJECT_FILE_NAME = os.path.join(REPO, "pyproject.toml")

    env = {"ENCODED_OKTA_ISSUER": None, "ENCODED_OKTA_CLIENT": None,
           "ENCODED_OKTA_SCOPES": None, "ENCODED_OKTA_REQUIRE_EMAIL_VERIFIED": None,
           "IDENTITY": None, "ENV_NAME": "smaht-test"}
    env.update(okta_env)
    out = io.StringIO()
    with override_environ(**env):
        _Manager.build_ini_stream_from_template(os.path.join(REPO, OKTA_TEMPLATE), out)
    return out.getvalue()


def _setting(rendered, key):
    """Return the value assigned to `key`, or None if the line is absent."""
    m = re.search(r"^%s\s*=\s*(.*)$" % re.escape(key), rendered, re.MULTILINE)
    return None if m is None else m.group(1).strip()


@pytest.mark.unit
def test_okta_template_declares_the_dcicutils_substitutions():
    """The template must carry exactly the four names dcicutils binds - and no
    Okta client secret, because the SPA is a public PKCE client."""
    template = _read(OKTA_TEMPLATE)
    assert "okta.issuer = ${OKTA_ISSUER}" in template
    assert "okta.client = ${OKTA_CLIENT}" in template
    assert "okta.scopes = ${OKTA_SCOPES}" in template
    assert "okta.require_email_verified = ${OKTA_REQUIRE_EMAIL_VERIFIED}" in template
    assert "OKTA_SECRET" not in template and "okta.secret" not in template


@pytest.mark.unit
def test_okta_settings_are_materialized_into_production_ini():
    """Startup rendering turns the identity's ENCODED_OKTA_* values into the
    `okta.*` application settings the portal reads at runtime."""
    rendered = _render_template(
        ENCODED_OKTA_ISSUER="https://example.okta.com/oauth2/default",
        ENCODED_OKTA_CLIENT="0oa1example2client3id",
        ENCODED_OKTA_SCOPES="openid email profile",
        ENCODED_OKTA_REQUIRE_EMAIL_VERIFIED="false",
    )
    assert _setting(rendered, "okta.issuer") == "https://example.okta.com/oauth2/default"
    assert _setting(rendered, "okta.client") == "0oa1example2client3id"
    assert _setting(rendered, "okta.scopes") == "openid email profile"
    assert _setting(rendered, "okta.require_email_verified") == "false"
    # Auth0 is unaffected by the Okta substitutions.
    assert _setting(rendered, "auth0.domain") == "hms-dbmi.auth0.com"


@pytest.mark.unit
@pytest.mark.parametrize("supplied", [None, "", "   ", "maybe", "yes", "1"])
def test_require_email_verified_line_is_omitted_unless_boolean(supplied):
    """dcicutils expands the setting to the empty string for anything that is not
    a boolean, which drops the assignment line entirely so the portal's own
    secure default (require a verified email) holds. An absent, blank, or
    unparseable identity value therefore cannot turn the check off."""
    rendered = _render_template(ENCODED_OKTA_REQUIRE_EMAIL_VERIFIED=supplied)
    assert _setting(rendered, "okta.require_email_verified") is None
    assert "okta.require_email_verified" not in rendered


@pytest.mark.unit
@pytest.mark.parametrize("supplied,expected", [("true", "true"), ("True", "true"),
                                               ("false", "false"), ("F", "false")])
def test_require_email_verified_line_is_rendered_when_boolean(supplied, expected):
    rendered = _render_template(ENCODED_OKTA_REQUIRE_EMAIL_VERIFIED=supplied)
    assert _setting(rendered, "okta.require_email_verified") == expected


@pytest.mark.unit
def test_unconfigured_okta_renders_no_okta_settings():
    """With the identity silent, every okta.* line drops out, so the portal reads
    'not configured' and the legacy Auth0 path is untouched."""
    rendered = _render_template()
    assert "okta." not in rendered
    assert "auth0.domain = hms-dbmi.auth0.com" in rendered


@pytest.mark.unit
def test_entrypoints_render_production_ini_once_before_serving():
    """The rendering above is what every production role actually runs, once,
    before it starts serving/indexing/ingesting."""
    for role in ("portal", "indexer", "ingester", "deployment"):
        entry = _read("deploy/docker/production/entrypoint_%s.sh" % role)
        assert entry.count("python -m assume_identity") == 1, role


@pytest.mark.unit
def test_dcicutils_is_pinned_to_the_exact_beta():
    """The Okta template substitutions only exist in this release, so the
    constraint is an exact pin and the lock must resolve to it."""
    pyproject = _read("pyproject.toml")
    assert re.search(r'^dcicutils = "%s"$' % re.escape(REQUIRED_DCICUTILS_VERSION),
                     pyproject, re.MULTILINE), \
        "pyproject.toml must pin dcicutils == " + REQUIRED_DCICUTILS_VERSION
    lock = _read("poetry.lock")
    m = re.search(r'name = "dcicutils"\nversion = "([^"]+)"', lock)
    assert m, "poetry.lock has no dcicutils entry"
    assert m.group(1) == REQUIRED_DCICUTILS_VERSION


@pytest.mark.unit
def test_installed_dcicutils_supports_the_okta_substitutions():
    """Guards against a lock/pin that says one thing and an install that does
    another: the resolved dcicutils must actually bind these names."""
    from importlib.metadata import version

    from dcicutils.deployment_utils import IniFileManager

    assert version("dcicutils") == REQUIRED_DCICUTILS_VERSION
    assert hasattr(IniFileManager, "okta_require_email_verified_setting")
    assert IniFileManager.okta_require_email_verified_setting("true") == "true"
    assert IniFileManager.okta_require_email_verified_setting("false") == "false"
    # Not a boolean -> empty expansion -> the assignment line is omitted.
    assert IniFileManager.okta_require_email_verified_setting("nonsense") == ""
