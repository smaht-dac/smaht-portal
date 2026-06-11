# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SMaHT Portal is a Pyramid-based web application for the Somatic Mosaicism across Human Tissues (SMaHT) Data Analysis Center. It uses a Python backend with a React/Redux frontend. The system is modeled on the ENCODED framework and inherits core functionality from `dcicsnovault` and `encoded-core` packages.

## Build & Setup

**Prerequisites:** Python 3.11, Node 20, PostgreSQL, OpenSearch/Elasticsearch, nginx

```bash
make build        # Full build: Poetry install + npm ci + webpack + SCSS
make rebuild      # Clean + full build
```

On macOS Catalina+: `make macbuild` / `make macrebuild`

Frontend only:
```bash
npm ci
npm run build       # Webpack bundle
npm run build-scss  # SCSS compilation
npm run watch-scss  # Watch mode for SCSS
```

## Running Locally

```bash
make deploy1   # Start PostgreSQL + OpenSearch, load test data + ingestion engine
make deploy2   # Start pserve app server (in a separate terminal)
# Optional: make deploy1a (no ingestion) + make deploy1b (ingestion separately)
make kill      # Kill all local server processes
```

## Testing

```bash
# Run all tests (matches CI behavior)
make test

# Unit tests only (no workbook fixture)
make test-unit
# or: pytest -xvv -r w --timeout=200 -m "not workbook"

# Workbook/integration tests
make test-npm
# or: pytest -xvv -r w --timeout=600 -m "workbook"

# Static checks + linting
make test-static

# Re-run last failures
make retest

# Run a single test file
pytest -xvv src/encoded/tests/test_my_module.py

# Run with a specific marker
pytest -xvv -m "schema"
```

**Test markers:** `unit`, `workbook`, `es`, `schema`, `search`, `ingestion`, `integrated`, `integratedx`, `performance`, `static`, `broken`, `slow`, `sloppy`, `manual`

CI (`make remote-test`) runs against AWS OpenSearch and requires AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`).

## Linting

```bash
make lint           # flake8 on deploy/ and src/encoded/
npm run lint        # ESLint on frontend
npm run format      # Prettier formatting
```

Config files: `.flake8`, `.eslintrc.json`, `.prettierrc.json`

## Architecture

### Backend (Python / Pyramid)

- **Entry point:** `src/encoded/__init__.py` — Pyramid app factory that includes snovault and encoded-core
- **Data model:** JSON schemas in `src/encoded/schemas/` define object types; corresponding Python classes in `src/encoded/types/` implement custom behavior
- **API:** Pyramid traversal — each JSON schema type becomes a traversable resource. Custom endpoints in `src/encoded/endpoints/`
- **Database:** PostgreSQL via SQLAlchemy (snovault manages the storage layer)
- **Search:** OpenSearch/Elasticsearch via `dcicsnovault`; search views in types and endpoints
- **Auth:** Auth0 for authentication; custom authorization in `src/encoded/authorization.py`
- **Ingestion:** Data submission pipeline in `src/encoded/ingestion/`
- **Upgrades:** Data migration scripts in `src/encoded/upgrade/`
- **CLI commands:** `src/encoded/commands/` — many console scripts defined in `pyproject.toml`

Key modules: `metadata.py` (metadata bundles), `visualization.py` (IGV/track hubs), `submission_status.py`, `analysis_runs.py`, `qc_overview.py`

### Frontend (React / Redux)

- **Entry point:** `src/encoded/static/browser.js` and `src/encoded/static/server.js` (SSR)
- **App root:** `src/encoded/static/components/app.js` — top-level React component, wraps Redux store
- **Routing:** URL-driven via Pyramid traversal; React handles client-side navigation through the `navigate` utility
- **State:** Redux store at `src/encoded/static/store.js`
- **Component registry:** `globals.js` manages `content_views` — a registry mapping item types to React components
- **Shared components:** Imported from `@hms-dbmi-bgm/shared-portal-components` (external npm package)
- **Styles:** SCSS in `src/encoded/static/scss/`; compiled to `src/encoded/static/css/`
- **Build output:** Webpack bundles to `src/encoded/static/build/`

### Key External Dependencies

| Package | Role |
|---|---|
| `dcicsnovault` | Core storage layer, PostgreSQL ORM, snovault framework |
| `encoded-core` | Shared portal functionality (auth, search, item types) |
| `dcicutils` | Utility functions, AWS helpers |
| `@hms-dbmi-bgm/shared-portal-components` | Shared React components |

### Data Model Pattern

1. Add a JSON schema to `src/encoded/schemas/<type>.json`
2. Create a Python class in `src/encoded/types/<type>.py` inheriting from snovault base classes
3. Register the type with `@collection(...)` decorator
4. Add upgrade scripts to `src/encoded/upgrade/<type>.py` if changing existing schemas

### Configuration

- `development.ini` — local dev config (created from `development.ini.template`)
- `test.ini` — test runner config
- `base.ini` — shared base config
- `pytest.ini` — pytest configuration (test paths: `src/encoded`, `deploy`)

## E2E Tests (Cypress)

```bash
npm run cypress:open   # Interactive mode
npm run cypress:test   # Headless mode
```

Cypress integration workflows in `.github/workflows/cypress-integration-*.yml` run against deployed environments (devtest, staging, data, wolf).

## Docker

```bash
make build-docker-local       # Build image via docker-compose
make deploy-docker-local      # Run via docker-compose
make deploy-docker-local-daemon  # Run in background
```

Production image: `python:3.11.12-slim-bullseye` base, runs nginx + pserve, exposes port 8000.
