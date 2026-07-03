# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

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

