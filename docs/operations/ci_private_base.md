# CI access to the private DHI base image

`.github/workflows/main.yml` authenticates to `dhi.io` with
`docker/login-action` before the DOCKER matrix build. Keep `DHI_USERNAME` and
`DHI_TOKEN` in GitHub Actions secrets accessible to `smaht-dac/smaht-portal`;
the account/token must be entitled to pull the private base named in `Dockerfile`.
Provision values through GitHub Secrets only, never source, logs, or chat.
Missing or inaccessible credentials must fail the build, not trigger a public
production-image fallback. Fork PRs cannot use repository secrets; validate
trusted changes through the existing trusted branch workflow, not by exposing
secrets to untrusted PR code.

The ordering, matrix condition, and secret-reference contract are checked in
`deploy/docker/production/tests/test_container_contracts.py`.
