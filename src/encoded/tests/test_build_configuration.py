"""Offline checks for build configuration and lint gate behavior."""

import os
import subprocess
from pathlib import Path

import pytest

from .conftest_settings import REPOSITORY_ROOT_DIR


pytestmark = [pytest.mark.unit, pytest.mark.working, pytest.mark.static]
ROOT = Path(REPOSITORY_ROOT_DIR)


def test_both_docker_stages_keep_security_upgrades():
    source = (ROOT / 'Dockerfile').read_text()
    stages = source.split('FROM ${BASE_IMAGE} AS ')[1:]
    assert len(stages) == 2
    for stage in stages:
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
