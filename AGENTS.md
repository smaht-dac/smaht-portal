# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Building the production Docker image locally

- `Dockerfile` is a BuildKit multi-stage build (`builder` -> `runtime`); it needs
  BuildKit (`DOCKER_BUILDKIT=1`, or Docker >= 23 default) because of the `# syntax=`
  directive and the `RUN --mount=type=cache` mounts. `buildspec.yml` sets
  `DOCKER_BUILDKIT: "1"` for CodeBuild.
- `docker build .` will fail at `COPY deploy/docker/local/docker_development.ini` with
  `"... not found"` unless that file exists in the build context. It is `.gitignore`d;
  CI creates it in `buildspec.yml` pre_build (`touch deploy/docker/local/docker_development.ini`).
  To build locally, `touch deploy/docker/local/docker_development.ini` first.
- nginx is NOT Debian's stock package: `deploy/docker/production/install_nginx_bullseye.sh`
  installs a pinned nginx.org build (1.21.6) and creates the non-root `nginx` user at
  uid/gid 121. The container runs everything as `nginx` under `supervisord` (which now also
  runs nginx via `[program:nginx]`; the entrypoints no longer `service nginx start`).

## Running the Python test suite

- The project uses a `src/` layout package named `encoded` (see `pyproject.toml`,
  `packages = [{ include="encoded", from="src" }]`). Tests live under
  `src/encoded/tests/` and use relative imports (e.g. `from ..item_utils.utils import ...`).
- `pytest.ini` sets `testpaths = src/encoded deploy` and pulls in datafixtures/serverfixtures
  plugins, so most tests are integration-style and require Postgres + Elasticsearch (and some
  require AWS/moto). Pure unit tests that only import functions can be run standalone, e.g.:
  `pytest src/encoded/tests/test_item_utils.py`.
- Test markers of note (`pytest.ini`): `-m "not workbook"` selects the non-workbook set,
  `-m unit` the proper unit tests, `-m static` the static-analysis tests. The Makefile
  `test-unit` / `test-npm` targets wrap these.
- Coverage tooling is available (`pytest-cov`, `coverage` are dev deps); add `--cov=encoded.<module>
  --cov-report=term-missing`. Note: modules imported before coverage starts (via conftest) can
  show import-time lines as "missed" — judge coverage by whether the function bodies are exercised,
  not the raw percentage.

## S3 upload/download credentials need `S3_UPLOAD_ROLE_ARN` once `encoded-core` >= 1.0.0

`encoded_core.types.file.external_creds()` generates the temporary S3 credentials returned by
`upload_credentials`/`extra_files_creds`/download redirects. As of `encoded-core` 1.0.0 it calls
`sts:assume_role` (previously `sts:get_federation_token`, changed because `GetFederationToken`
cannot be called with temporary credentials — which is exactly what OIDC-based
`aws-actions/configure-aws-credentials` produces in CI).

`assume_role` requires an explicit `RoleArn`. That value comes *only* from:
- `identity.get('S3_UPLOAD_ROLE_ARN')` when the `IDENTITY` env var is set (production path, value
  lives in the app's Secrets Manager `GLOBAL_APPLICATION_CONFIGURATION` secret), or
- `os.environ.get('S3_UPLOAD_ROLE_ARN')` otherwise — the path taken by unit tests, since
  `conftest.py` sets `USE_SAMPLE_ENVUTILS = True` and never sets `IDENTITY`.

There is no `S3_UPLOAD_ROLE_ARN` wired into this repo's CI (`.github/workflows/main.yml`),
`Makefile`, or `conftest.py`, so any test that exercises file upload/download credentials
(`test_permissions.py`, `test_types_file.py`, `test_schema_meta_workflow.py`, etc.) fails with
`ParamValidationError: Invalid type for parameter RoleArn, value: None` until that env var is set
to a real IAM role ARN. That role must (a) have S3 `GetObject`/`PutObject`/`ListBucket` on the
unit-test buckets (e.g. `smaht-unit-testing-wfout`), and (b) trust whatever identity the CI job
authenticates as (the role behind `AWS_OIDC_ROLE_ARN`) for `sts:AssumeRole`. This is an AWS IAM
change plus a new GitHub Actions secret — not fixable from application code alone. See PR #646 for
the full investigation.

## `dcicsnovault` version pin lags upstream ES-efficiency fixes; regenerating poetry.lock is risky in a sandbox

`pyproject.toml` pins `dcicsnovault` to an exact version (currently `11.30.2.0b1`, no caret). As of
2026-07-07, snovault PR https://github.com/4dn-dcic/snovault/pull/318 (ES query engine efficiency
fixes: `compound_search` `_source` scope, skipping default facets on non-embedded frames,
`frame=object`/`raw` `_source` scope, `limit=all` pagination no longer resending aggs) merged and
shipped in snovault `11.30.5` per its `CHANGELOG.rst`. That's newer than the pinned version, so
routes that delegate to snovault's shared `search()`/`compound_search` (e.g. `/browse`, see
`src/encoded/browse.py`) do not yet get those fixes. The next PyPI-published release is `11.32.1`
(intermediate `11.30.3`–`11.32.0` versions exist in the changelog but were never published to
PyPI), which also bundles unrelated changes (a `create_unauthorized_user` privilege-escalation fix,
SQS test-queue namespacing) — so this needs a deliberate, reviewed dependency-bump PR, not a
drive-by change.

Do not attempt to regenerate `poetry.lock` for a scoped version bump without the *exact* Poetry
version originally used (check the lock file's header comment, e.g. `Poetry 1.4.2`, vs. the
`Makefile`'s `pip install poetry==1.8.5` — these can disagree, as they did here). Even
`poetry lock --no-update` with a different Poetry version re-resolved dozens of unrelated
transitive packages (boto3, cryptography, coverage, etc.) into a large, unreviewable diff when
tried in a network-connected sandbox with no working local `poetry` (homebrew's `poetry` here was
broken: `dyld: Library not loaded: .../libintl.8.dylib`; a scratch venv with `pip install
poetry==<version>` works around that without touching system state, but doesn't fix the
version-mismatch resolution risk).
