"""Offline checks for build configuration and lint gate behavior."""

import importlib.util
import os
import subprocess
from pathlib import Path

import pytest

from .conftest_settings import REPOSITORY_ROOT_DIR


pytestmark = [pytest.mark.unit, pytest.mark.working, pytest.mark.static]
ROOT = Path(REPOSITORY_ROOT_DIR)


@pytest.fixture
def configure_apt_security():
    path = ROOT / 'deploy/docker/production/configure_apt_security.py'
    spec = importlib.util.spec_from_file_location('configure_apt_security', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.configure_apt_security


@pytest.mark.parametrize('scheme', ['http', 'https'])
def test_apt_security_mirror_preserves_suite_and_trust(scheme, tmp_path, configure_apt_security):
    source = tmp_path / 'sources.list'
    original = (
        'deb http://deb.debian.org/debian bullseye main\n'
        f'deb [signed-by=/keyring.gpg] {scheme}://deb.debian.org/debian-security bullseye-security main\n'
        '# http://deb.debian.org/debian-security is the old mirror\n'
        'deb https://example.org/debian-security custom main\n'
        'deb https://deb.debian.org/debian-security-other custom main\n'
    )
    source.write_text(original)
    assert configure_apt_security(tmp_path) == [source]
    expected = original.replace(
        f'{scheme}://deb.debian.org/debian-security bullseye-security',
        'https://security.debian.org/debian-security bullseye-security')
    assert source.read_text() == expected
    mtime = source.stat().st_mtime_ns
    assert configure_apt_security(tmp_path) == []
    assert source.stat().st_mtime_ns == mtime


def test_apt_security_mirror_supports_deb822_and_additional_lists(tmp_path, configure_apt_security):
    directory = tmp_path / 'sources.list.d'
    directory.mkdir()
    deb822 = directory / 'debian.sources'
    deb822.write_text(
        'Types: deb deb-src\n'
        'URIs: http://deb.debian.org/debian-security/\n'
        'Suites: bullseye-security\nComponents: main\n'
        'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg\n'
        'Check-Valid-Until: yes\n')
    legacy = directory / 'security.list'
    legacy.write_text('deb https://deb.debian.org/debian-security bullseye-security main\n')
    disabled = directory / 'security.list.disabled'
    disabled.write_text(legacy.read_text())
    before = {p: p.read_text() for p in (deb822, legacy, disabled)}
    assert set(configure_apt_security(tmp_path)) == {deb822, legacy}
    for path in (deb822, legacy):
        expected = before[path].replace('http://deb.debian.org/debian-security',
                                       'https://security.debian.org/debian-security').replace(
            'https://deb.debian.org/debian-security', 'https://security.debian.org/debian-security')
        assert path.read_text() == expected
    assert disabled.read_text() == before[disabled]
    assert configure_apt_security(tmp_path) == []


def test_apt_security_mirror_handles_no_matching_sources(tmp_path, configure_apt_security):
    assert configure_apt_security(tmp_path) == []


def test_both_docker_stages_configure_security_mirror_before_apt():
    source = (ROOT / 'Dockerfile').read_text()
    for stage in source.split('FROM ${BASE_IMAGE} AS ')[1:]:
        assert stage.index('COPY deploy/docker/production/configure_apt_security.py') < stage.index('apt-get update')
        assert stage.index('RUN python /tmp/configure_apt_security.py') < stage.index('apt-get update')
        assert 'apt-get update && apt-get upgrade -y' in stage
        assert '--fix-missing' not in stage and '--allow-unauthenticated' not in stage


@pytest.mark.parametrize('exit_code', [0, 7])
def test_make_lint_checks_both_trees_and_propagates_failure(exit_code, tmp_path):
    fake_bin = tmp_path / 'bin'
    fake_bin.mkdir()
    flake8 = fake_bin / 'flake8'
    flake8.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$TRACE_FILE"\n' + f'exit {exit_code}\n')
    flake8.chmod(0o755)
    trace = tmp_path / 'arguments.txt'
    result = subprocess.run(
        ['make', '--no-print-directory', '-f', str(ROOT / 'Makefile'), 'lint'],
        cwd=tmp_path, capture_output=True, text=True,
        env={'PATH': str(fake_bin) + os.pathsep + os.defpath, 'HOME': str(tmp_path), 'TRACE_FILE': str(trace)},
        check=False,
    )
    assert (result.returncode == 0) is (exit_code == 0), result.stdout + result.stderr
    assert trace.read_text().splitlines() == ['deploy/', 'src/encoded/']
