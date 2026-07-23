# Project agent memory

This is the committed guide to durable, project-intrinsic knowledge. Prefer pointers to
authoritative files over copied details; use `README.rst` for the longer macOS setup walkthrough.

## Repository map

- `src/encoded/` is the Python `encoded` package (the `src/` layout is declared in
  `pyproject.toml`). `src/encoded/__init__.py` is the Pyramid application factory and the best
  overview of registered backend subsystems.
- `src/encoded/types/` contains item classes, calculated properties, collections, and ACL behavior.
  Their JSON Schemas live in `src/encoded/schemas/`; versioned schema migrations live in
  `src/encoded/upgrade/`. Changes to an item model commonly require coordinated edits and tests
  across all three.
- `src/encoded/item_utils/` holds reusable domain calculations and predicates. HTTP views and
  feature endpoints are mostly top-level modules such as `browse.py`, `metadata.py`, and
  `visualization.py`, plus `src/encoded/endpoints/`. Submission processing is under
  `src/encoded/ingestion/`; administrative CLIs are under `src/encoded/commands/` and registered in
  `[tool.poetry.scripts]` in `pyproject.toml`.
- `src/encoded/static/` is the React frontend. `browser.js` and `server.js` are the client and
  server-rendering entries; `components/` is organized around browse, item pages, static pages,
  navigation, forms, shared UI, and visualizations. SCSS sources are in `static/scss/`. Webpack and
  Gulp configuration is in `webpack.config.js` and `gulpfile.js`; generated bundles/CSS go under
  `static/build/` and `static/css/`.
- `docs/public/` supplies portal-managed static page content; `docs/source/` contains user-facing
  documentation sources. `deploy/` contains container/runtime assets and Cypress post-deploy tests.
  `scripts/` and `bin/` contain developer and operational helpers.
- Core persistence, indexing, search, CRUD, and ingestion machinery comes from `dcicsnovault`;
  shared data models and views come from `encoded-core`. Their resolved versions are authoritative
  in `poetry.lock`, not just the compatible ranges in `pyproject.toml`.

## Architecture and data flow

- Pyramid starts through the `encoded:main` Paste factory. `include_snovault()` in
  `src/encoded/__init__.py` selectively registers the framework services, while `include_encoded()`
  registers portal-specific modules. `encoded.project_defs` and `src/encoded/project/` provide the
  project-specific hooks expected by the shared libraries.
- JSON Schema defines stored item shape and validation; Python type modules add collection metadata,
  calculated properties, permissions, and relationships. Writes persist in PostgreSQL, then the
  Snovault indexer materializes embedded documents in OpenSearch. Browse/search reads normally use
  OpenSearch; item CRUD and indexing behavior therefore spans schemas, types, embeds, and invalidation.
- `src/encoded/browse.py` delegates `/browse` to Snovault search. Frame and indexing/search behavior
  should be checked in the resolved Snovault source before adding portal-side workarounds.
- Pyramid supplies initial page data and the server-rendered React bundle; the browser bundle then
  hydrates and calls JSON endpoints. Follow `webpack.config.js` aliases and bundle entries when
  tracing frontend imports. Shared UI dependencies include `@hms-dbmi-bgm/shared-portal-components`
  and `@hms-dbmi-bgm/react-workflow-viz` (see `package.json` and their Gulp build steps).
- Ingestion submissions flow through `src/encoded/ingestion/` into Snovault's listener/message
  infrastructure. Production runs portal, indexer, ingester, and deployment entrypoint roles from
  `deploy/docker/production/`; do not assume every role executes the same startup path.

## Configuration and deployment

- `base.ini` is the shared Paste/Pyramid base. Local `development.ini` and `test.ini` are generated
  from ignored `*.template` files by `prepare-local-dev` during `make build`; do not commit generated
  files or secrets. The generation logic is in `src/encoded/commands/prepare_template.py`.
- Runtime environment and secret translation happens in `src/encoded/__init__.py` and
  `deploy/docker/production/assume_identity.py`. Production builds `production.ini` from the AWS
  Secrets Manager identity named by `IDENTITY`, using `deploy/docker/production/smaht_any_alpha.ini`
  as the settings convention. Treat identities, Auth0 values, database/search endpoints, and AWS
  credentials as external configuration.
- `Dockerfile` is a BuildKit multi-stage build (`builder` then non-root `runtime`). A local production
  image build needs `touch deploy/docker/local/docker_development.ini` first because the ignored file
  is copied into the image; `.github/workflows/main.yml` and `buildspec.yml` do the same. Build with
  `DOCKER_BUILDKIT=1 docker build .` when BuildKit is not already the default.
- The production image installs the pinned nginx.org build via
  `deploy/docker/production/install_nginx_bullseye.sh`, rather than Debian nginx. `supervisord.conf`
  runs nginx and multiple non-root Pyramid processes; role entrypoints build runtime configuration
  before serving, indexing, ingesting, or deploying.
- `buildspec.yml` builds and pushes the ECR image. GitHub Actions in `.github/workflows/main.yml`
  runs the Python test suite and a production Docker build; separate Cypress workflows exercise
  deployed environments. Deployment configuration is operationally sensitive—document it, but do
  not casually change it alongside application work.

## Local development

- Supported Python is declared in `pyproject.toml` (currently 3.11/3.12); CI uses Python 3.11 and
  Node 20. Use the lockfiles and repository commands rather than ad hoc dependency upgrades.
- `make build` installs frontend dependencies with `npm ci`, builds assets, installs Poetry 1.8.5
  and Python dependencies, and generates local INI files. It also downloads AWS IP ranges and
  restricted-domain data, so it requires network access.
- Start PostgreSQL/OpenSearch/nginx and load local data with `make deploy1`, then serve Pyramid in a
  second terminal with `make deploy2`; the portal is proxied at `http://localhost:8000`. Variants
  `deploy1a`/`deploy1b` separate the ingestion listener for debugging. These commands clear the local
  `/tmp/encoded` data area; `make kill` uses broad process-name kills and must be used carefully.
- Useful frontend loops are `npm run dev-quick`, `npm run watch-scss`, `npm run lint`, and
  `npm run build`. The Makefile remains the authoritative command catalog (`make help`).

## Tests and checks

- `pytest.ini` sets test roots to `src/encoded` and `deploy` and loads custom fixtures from
  `src/encoded/tests/datafixtures.py` and `snovault.tests.serverfixtures`. Most backend tests are integration-like
  and start PostgreSQL/OpenSearch; fixtures and shared settings are in `src/encoded/tests/conftest.py`
  and `conftest_settings.py`.
- Focus first: `pytest -vv src/encoded/tests/test_<area>.py` or add `-k <name>`. Pure utility tests can
  run alone, but schema/type/view tests usually need the fixture stack. For fully mocked/unit tests,
  `NO_SERVER_FIXTURES=true` makes the session-scoped PostgreSQL/ES fixtures no-ops so they run without
  local database binaries (the gate lives in `dcicutils.ff_mocks` and `snovault.tests.serverfixtures`). Add
  `--cov=encoded.<module> --cov-report=term-missing` for focused coverage; conftest imports before
  coverage starts can make import-time lines appear missed.
- `make test` runs both marker groups. Despite legacy target names, `make test-unit` means
  `-m "not workbook"` and `make test-npm` means `-m workbook`; trust the recipes in `Makefile`.
  `make test-static` runs static pytest checks plus frontend lint. `make remote-test` uses the shared
  AWS-authenticated OpenSearch test service and is the CI path, not a credential-free local check.
- There is no Jest/UI unit-test harness (`src/encoded/static/components/__tests__/` holds only a
  `.jshintrc`; no jest dependency, config, or npm test script). Frontend invariants are covered by
  static source-contract pytest checks in `src/encoded/tests/test_static.py`. Cypress specifications
  and configuration live under `deploy/post_deploy_testing/`. Use the `cypress:*` scripts in
  `package.json`; they require Auth0 credentials and an explicit/local or deployed target.

## Integration and operational sharp edges

- AWS-backed tests generally need usable AWS credentials and `GLOBAL_ENV_BUCKET`. Temporary S3
  upload/download credentials also require `S3_UPLOAD_ROLE_ARN`: production reads it through the
  configured identity, while tests without `IDENTITY` read the environment variable. CI supplies it
  from `AWS_OIDC_ROLE_ARN`; local runs must supply an assumable role with the required bucket access.
- Test indices are shared remote infrastructure when `--aws-auth --es ...` is used. Preserve the
  unique `TEST_JOB_ID` convention and cleanup behavior in `.github/workflows/main.yml` to avoid
  collisions or leaked indices.
- Search behavior can change through compatible dependency resolution. The current lockfile resolves
  Snovault with source-frame filtering, facet avoidance for non-embedded frames, and efficient
  `limit=all` pagination. Recheck `poetry.lock` and resolved package code before claiming a dependency
  bump or portal patch is needed.
- Schema changes are migrations, not only JSON edits: update `src/encoded/upgrade/` when existing
  stored data must transform, bump schema versions according to neighboring types, and cover both
  schema validation and upgrader behavior.

## `skip_default_facets=true` + `additional_facet=type` is an HTTP 400 in Snovault

Requesting `type` as an `additional_facet` while also passing `skip_default_facets=true` makes
Snovault infer a `stats` aggregation on the `embedded.@type.raw` keyword field, which OpenSearch
rejects. For queries already filtered to `type=File`, read the response's top-level `total` instead.
The authoritative implementation and regression coverage are in `src/encoded/metadata.py`,
`src/encoded/static/components/browse/browse-view/BrowseDonorPeekMetadata.js`, and
`src/encoded/static/components/__tests__/BrowseDonorPeekMetadata.test.js`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
