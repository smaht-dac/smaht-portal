# Production DHI base image and CI access

Production ships on the private Docker Hardened Images base
`dhi.io/python:3.11-debian-sfw-dev`. The `Dockerfile`'s default `BASE_IMAGE` is the
public `python:3.11.16-slim-bookworm` only so that a plain `docker build .` works
without registry auth; a public-base build is portable evidence, not validation of
the production image.

## Production build (CodeBuild)

`buildspec.yml` builds with `--build-arg BASE_IMAGE="$DHI_BASE_IMAGE"`. It reads
`DHI_USERNAME`/`DHI_TOKEN` from the JSON Secrets Manager secret
`dhi-registry-credentials` (keys `username` and `token`); the CodeBuild service role
needs `secretsmanager:GetSecretValue` on it. The token reaches `docker login dhi.io`
on stdin only. A missing secret, a `DHI_BASE_IMAGE` that is not a `dhi.io/` image, or
a failed login aborts the build, so it can never fall back to the public base.
CodeBuild project environment variables override these buildspec values, which is
how a deployment can pin `DHI_BASE_IMAGE` to a digest or name its own secret.

The nginx install script refuses any base that is not Debian bookworm, so a moved
DHI tag fails the build instead of mixing Debian suites.

## CI

The DOCKER matrix job in `.github/workflows/main.yml` first builds and smoke-tests
the public default base (no credentials), then authenticates to `dhi.io` with
`docker/login-action` and builds and smoke-tests the production DHI base. Keep
`DHI_USERNAME` and `DHI_TOKEN` in GitHub Actions secrets accessible to
`smaht-dac/smaht-portal`; the account/token must be entitled to pull that base.
Without them the "Authenticate Docker Hardened Images" step fails, which is the
correct signal that the production image is unvalidated. `fail-fast: false` keeps
that failure from cancelling the UNIT job.

Provision values through GitHub Secrets or AWS Secrets Manager only, never source,
logs, or chat. Fork PRs cannot use repository secrets; validate trusted changes
through the existing trusted branch workflow, not by exposing secrets to untrusted
PR code.

These contracts are checked in
`deploy/docker/production/tests/test_container_contracts.py`.
