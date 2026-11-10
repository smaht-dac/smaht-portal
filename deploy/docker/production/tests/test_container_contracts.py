"""Container configuration contracts and executable startup-template behavior."""

import configparser
import os
import re
import shlex
import subprocess
import time
import tomllib

import pytest
import yaml

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OKTA_TEMPLATE = "deploy/docker/production/smaht_any_alpha.ini"


def _read(rel):
    with open(os.path.join(REPO, rel), encoding="utf-8") as fh:
        return fh.read()


PRODUCTION_DHI_BASE_IMAGE = (
    "dhi.io/python:3.11-debian13-sfw-dev"
    "@sha256:c7288562a4492de0c1f1ff851e7eee1f2d0cd4f9e5ae5fef0701188344c7be83"
)
NGINX_INSTALL_SCRIPT = "deploy/docker/production/install_nginx_debian.sh"


def _ci_docker_steps():
    workflow = yaml.safe_load(_read(".github/workflows/main.yml"))
    return workflow["jobs"]["build"]


@pytest.mark.unit
def test_ci_builds_the_production_dhi_base_after_authenticating():
    job = _ci_docker_steps()
    assert job["strategy"]["fail-fast"] is False
    steps = job["steps"]
    names = [step.get("name") for step in steps]
    login = next(step for step in steps if step.get("uses") == "docker/login-action@v3")
    public = steps[names.index("Docker Build")]
    dhi = steps[names.index("Docker Build (production DHI base)")]
    dhi_smoke = steps[names.index("Non-root nginx request-body smoke test (production DHI base)")]
    # The portable public-base build needs no credentials, so it runs first.
    assert steps.index(public) < steps.index(login) < steps.index(dhi) < steps.index(dhi_smoke)
    docker_only = "${{ matrix.test_type == 'DOCKER' }}"
    assert login["if"] == public["if"] == dhi["if"] == dhi_smoke["if"] == docker_only
    assert login["with"] == {
        "registry": "dhi.io",
        "username": "${{ secrets.DHI_USERNAME }}",
        "password": "${{ secrets.DHI_TOKEN }}",
    }
    assert dhi["env"]["DHI_BASE_IMAGE"] == PRODUCTION_DHI_BASE_IMAGE
    assert '--build-arg BASE_IMAGE="$DHI_BASE_IMAGE"' in dhi["run"]
    assert "smaht-portal:ci-dhi" in dhi["run"] and "smaht-portal:ci-dhi" in dhi_smoke["run"]


@pytest.mark.unit
def test_production_codebuild_ships_the_dhi_base_and_fails_closed():
    spec = yaml.safe_load(_read("buildspec.yml"))
    assert spec["env"]["variables"]["DHI_BASE_IMAGE"] == PRODUCTION_DHI_BASE_IMAGE
    assert spec["env"]["secrets-manager"] == {
        "DHI_USERNAME": "dhi-registry-credentials:username",
        "DHI_TOKEN": "dhi-registry-credentials:token",
    }
    pre_build, build = spec["phases"]["pre_build"], spec["phases"]["build"]
    assert pre_build["on-failure"] == build["on-failure"] == "ABORT"
    guard = next(c for c in pre_build["commands"] if "DHI_BASE_IMAGE" in c and "case" in c)
    login = next(c for c in pre_build["commands"] if "docker login dhi.io" in c)
    assert pre_build["commands"].index(guard) < pre_build["commands"].index(login)
    # The token reaches docker on stdin, never on the command line.
    assert "--password-stdin" in login and '"$DHI_TOKEN" |' in login
    builds = [c for c in build["commands"] if c.startswith("docker build")]
    assert builds == ['docker build --build-arg BASE_IMAGE="$DHI_BASE_IMAGE" -t $IMAGE_REPO_NAME:$IMAGE_TAG .']


@pytest.mark.unit
@pytest.mark.parametrize("value,accepted", [
    (PRODUCTION_DHI_BASE_IMAGE, True),
    ("dhi.io/python:3.11-debian13-sfw-dev", False),   # mutable tag, not digest-pinned
    ("python:3.11.16-slim-bookworm", False),
    ("docker.io/python@sha256:" + "0" * 64, False),
    ("dhi.io/python@sha256:", False),
    ("", False),
])
def test_production_base_image_guard_only_accepts_pinned_dhi(value, accepted):
    spec = yaml.safe_load(_read("buildspec.yml"))
    guard = next(c for c in spec["phases"]["pre_build"]["commands"]
                 if "DHI_BASE_IMAGE" in c and "case" in c)
    result = subprocess.run(["sh", "-c", guard], env={"DHI_BASE_IMAGE": value, "PATH": os.defpath},
                            capture_output=True, text=True)
    assert (result.returncode == 0) is accepted, result.stderr


def _run_nginx_installer(tmp_path, os_release_text):
    """Run the real installer up to its first package step (a stubbed addgroup)."""
    os_release = tmp_path / "os-release"
    os_release.write_text(os_release_text)
    stub = tmp_path / "bin"
    stub.mkdir(exist_ok=True)
    (stub / "addgroup").write_text('#!/bin/sh\necho "reached-install PKG_RELEASE=$PKG_RELEASE"\nexit 97\n')
    (stub / "addgroup").chmod(0o755)
    return subprocess.run(
        ["bash", os.path.join(REPO, NGINX_INSTALL_SCRIPT)],
        env={"OS_RELEASE_FILE": str(os_release), "PATH": f"{stub}{os.pathsep}{os.defpath}"},
        capture_output=True, text=True,
    )


@pytest.mark.unit
@pytest.mark.parametrize("codename", ["bullseye", "buster", "sid", ""])
def test_nginx_install_script_refuses_unsupported_debian_releases(codename, tmp_path):
    result = _run_nginx_installer(tmp_path, f"VERSION_CODENAME={codename}\n")
    assert result.returncode == 1
    assert "unsupported base image Debian release" in result.stderr
    assert "reached-install" not in result.stdout


@pytest.mark.unit
def test_nginx_install_script_refuses_a_missing_codename(tmp_path):
    result = _run_nginx_installer(tmp_path, "ID=debian\n")
    assert result.returncode == 1
    assert "reached-install" not in result.stdout


@pytest.mark.unit
@pytest.mark.parametrize("os_release,codename", [
    # Shapes of the real files: Debian slim bookworm, and the DHI Debian 13 base.
    ('PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nVERSION_ID="12"\nVERSION_CODENAME=bookworm\nID=debian\n',
     "bookworm"),
    ('PRETTY_NAME="Debian GNU/Linux 13 (trixie)"\nVERSION_ID="13"\nVERSION_CODENAME=trixie\nID=debian\n',
     "trixie"),
])
def test_nginx_install_script_pins_packages_for_the_detected_release(os_release, codename, tmp_path):
    result = _run_nginx_installer(tmp_path, os_release)
    assert f"reached-install PKG_RELEASE=1~{codename}" in result.stdout, result.stderr
    assert "unsupported" not in result.stderr


@pytest.mark.unit
def test_log_shipper_quietly_tails_all_app_files(tmp_path):
    """Execute the configured shipper against relocated worker log files."""
    config = configparser.ConfigParser(interpolation=None)
    config.read_string(_read("deploy/docker/production/supervisord.conf"))
    worker_paths = {
        config[section]["stdout_logfile"]
        for section in config.sections()
        if section.startswith("program:smaht")
    }
    assert len(worker_paths) == 5
    relocated = {
        path: str(tmp_path / os.path.basename(path)) for path in worker_paths
    }
    for path in relocated.values():
        with open(path, "w"):
            pass
    args = [
        relocated.get(arg, arg)
        for arg in shlex.split(config["program:log-shipper"]["command"])
    ]
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        time.sleep(0.2)
        for index, path in enumerate(sorted(relocated.values())):
            with open(path, "a") as log_file:
                log_file.write(f'{{"event":{index}}}\n')
        time.sleep(1.2)
    finally:
        process.terminate()
        output, _ = process.communicate(timeout=2)

    assert sorted(output.splitlines()) == [
        f'{{"event":{index}}}' for index in range(len(worker_paths))
    ]


def _render_template(**okta_env):
    """Render the production.ini output contract using the startup consumer."""
    import io

    from dcicutils.env_utils import EnvUtils
    from dcicutils.misc_utils import override_environ

    from deploy.docker.production.assume_identity import SMAHTDockerIniFileManager

    EnvUtils.set_declared_data(EnvUtils.SAMPLE_TEMPLATE_FOR_CGAP_TESTING)

    class _Manager(SMAHTDockerIniFileManager):
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
    m = re.search(r"^%s\s*=\s*(.*)$" % re.escape(key), rendered, re.MULTILINE)
    return None if m is None else m.group(1).strip()


@pytest.mark.unit
def test_okta_settings_are_materialized_into_production_ini():
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
    assert _setting(rendered, "auth0.domain") == "hms-dbmi.auth0.com"


@pytest.mark.unit
@pytest.mark.parametrize("supplied", [None, "", "   ", "maybe", "yes", "1"])
def test_require_email_verified_line_is_omitted_unless_boolean(supplied):
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
    rendered = _render_template()
    assert "okta." not in rendered
    assert "auth0.domain = hms-dbmi.auth0.com" in rendered


@pytest.mark.unit
def test_dcicutils_resolves_to_a_released_version():
    """The Okta bindings live in the portal, so dcicutils needs no beta pin."""
    lock = tomllib.loads(_read("poetry.lock"))
    versions = [package["version"] for package in lock["package"] if package["name"] == "dcicutils"]
    assert len(versions) == 1
    assert re.fullmatch(r"\d+\.\d+\.\d+", versions[0]), versions


@pytest.mark.unit
@pytest.mark.parametrize("supplied,expected", [
    (True, "true"), (False, "false"), ("true", "true"), ("F", "false"),
    (None, ""), ("", ""), ("maybe", ""), ("yes", ""), ("1", ""),
])
def test_startup_bridge_normalizes_require_email_verified(supplied, expected):
    from deploy.docker.production.assume_identity import SMAHTDockerIniFileManager

    assert SMAHTDockerIniFileManager.okta_require_email_verified_setting(supplied) == expected


@pytest.mark.unit
def test_startup_bridge_ignores_a_stray_unprefixed_okta_variable(monkeypatch):
    """Only the identity's ENCODED_OKTA_* values reach production.ini."""
    monkeypatch.setenv("OKTA_REQUIRE_EMAIL_VERIFIED", "false")
    rendered = _render_template()
    assert "okta.require_email_verified" not in rendered
