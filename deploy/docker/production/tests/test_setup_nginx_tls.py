"""CI wrapper for the nginx LB->ECS TLS materialization regression tests.

The substantive assertions live in ``setup_nginx_tls_tests.sh`` (a self-contained
POSIX-sh harness that mints throwaway certs with openssl and drives the real
``setup_nginx_tls.sh`` the way ``entrypoint_portal.sh`` does). This wrapper lets
the shell suite run inside the project's normal ``pytest`` / ``make test-unit``
path without requiring AWS, Secrets Manager, or a running load balancer.
"""

import os
import shutil
import subprocess

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
TEST_SCRIPT = os.path.join(HERE, "setup_nginx_tls_tests.sh")


@pytest.mark.unit
def test_setup_nginx_tls_regressions():
    """TLS-disabled is a no-op; missing/malformed/mismatched cert material fails
    loudly and non-zero and never echoes the secret; valid material writes 0600
    files, a valid ``listen ... ssl`` server block (validated by ``nginx -t``),
    and an explicit HEALTHY line. Run the shell harness; non-zero exit means an
    assertion failed."""
    sh = shutil.which("sh")
    assert sh, "POSIX sh is required to run the nginx TLS setup tests"
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
        "setup_nginx_tls_tests.sh reported failures:\n" + result.stdout + result.stderr
    )
