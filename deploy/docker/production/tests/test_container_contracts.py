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
REQUIRED_DCICUTILS_VERSION = "8.19.0.1b1"


def _read(rel):
    with open(os.path.join(REPO, rel), encoding="utf-8") as fh:
        return fh.read()


@pytest.mark.unit
def test_ci_authenticates_private_dhi_before_build():
    workflow = yaml.safe_load(_read(".github/workflows/main.yml"))
    steps = workflow["jobs"]["build"]["steps"]
    login = next(step for step in steps if step.get("uses") == "docker/login-action@v3")
    build = next(step for step in steps if step.get("name") == "Docker Build")
    assert steps.index(login) < steps.index(build)
    assert login["if"] == build["if"] == "${{ matrix.test_type == 'DOCKER' }}"
    assert login["with"] == {
        "registry": "dhi.io",
        "username": "${{ secrets.DHI_USERNAME }}",
        "password": "${{ secrets.DHI_TOKEN }}",
    }


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

    from dcicutils.deployment_utils import BasicOrchestratedSMAHTIniFileManager
    from dcicutils.env_utils import EnvUtils
    from dcicutils.misc_utils import override_environ

    EnvUtils.set_declared_data(EnvUtils.SAMPLE_TEMPLATE_FOR_CGAP_TESTING)

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
def test_dcicutils_is_pinned_to_the_exact_beta():
    pyproject = tomllib.loads(_read("pyproject.toml"))
    assert pyproject["tool"]["poetry"]["dependencies"]["dcicutils"] == REQUIRED_DCICUTILS_VERSION
    lock = tomllib.loads(_read("poetry.lock"))
    versions = [package["version"] for package in lock["package"] if package["name"] == "dcicutils"]
    assert versions == [REQUIRED_DCICUTILS_VERSION]


@pytest.mark.unit
def test_installed_dcicutils_supports_the_okta_substitutions():
    from dcicutils.deployment_utils import IniFileManager

    assert IniFileManager.okta_require_email_verified_setting("true") == "true"
    assert IniFileManager.okta_require_email_verified_setting("false") == "false"
    assert IniFileManager.okta_require_email_verified_setting("nonsense") == ""
