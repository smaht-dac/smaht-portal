"""CI wrapper for the Splunk forwarder startup regression tests.

The substantive assertions live in ``run_forwarder_tests.sh`` (a self-contained
POSIX-sh harness that installs a fake ``splunk`` CLI and drives the real
``run_splunk_forwarder.sh`` the way supervisord does). This wrapper lets the
shell suite run inside the project's normal ``pytest`` / ``make test-unit`` path
without requiring Postgres, Elasticsearch, AWS, or a real Splunk install.
"""

import os
import shutil
import subprocess

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
TEST_SCRIPT = os.path.join(HERE, "run_forwarder_tests.sh")


@pytest.mark.unit
def test_splunk_forwarder_startup_regressions():
    """Every startup stage is visible, failures are loud and identify the failed
    command + exit code, secrets stay redacted, readiness timeout / non-running
    splunkd fails non-zero, and a successful start reaches an explicit HEALTHY
    message. Run the shell harness; non-zero exit means an assertion failed."""
    sh = shutil.which("sh")
    assert sh, "POSIX sh is required to run the forwarder startup tests"
    result = subprocess.run(
        [sh, TEST_SCRIPT],
        capture_output=True,
        text=True,
        timeout=180,
    )
    # Always surface the harness output so a failure is diagnosable in CI logs.
    print(result.stdout)
    print(result.stderr)
    assert result.returncode == 0, (
        "run_forwarder_tests.sh reported failures:\n" + result.stdout + result.stderr
    )
