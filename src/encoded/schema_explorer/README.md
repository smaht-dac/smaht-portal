# Portal Schema Explorer

Open `/schema-explorer`, or choose **Schema Explorer** in an admin's account menu.
The page, model, source viewer and assets require `group.admin`. Item API
requests use the current browser session and retain normal portal permissions.

The React page mounts the explorer directly in the portal document, without an
iframe. A shadow root isolates its CSS and IDs while the portal owns navigation
and page scrolling. The old `/schema-explorer/ui` URL redirects to the portal page. SVG rendering, filtering,
relationship planning, item provenance and PNG export are adapted from the local
extension (0.4.5). The asset scripts and CSS are loaded only on this page, outside
the main webpack bundle. There are no new npm dependencies. Assets are served from
this Python package, not from the public static directory.

## Model lifecycle

By default, the deployed `encoded`, `encoded_core` and `snovault` source files are
analyzed once, on the first authorized model request in each server worker. The
result is cached under a lock. Application modules are parsed, not executed. The
source snapshot and model come from the same analysis. Restart the worker after
source changes; **Refresh** reloads the deployed snapshot, not local source edits.

Optionally precompute during deployment:

```sh
python -m encoded.schema_explorer /path/to/schema-explorer.json
```

Set `schema_explorer.artifact = /path/to/schema-explorer.json` in the server INI
to use that artifact instead. Generate it in the same environment/image that will
serve it. It contains model metadata and indexed source code; do not put it in a
public static directory. No deployment entrypoints are changed by this feature.

## Data and security

- No `~/.smaht-keys.json`, environment selector or server-side request proxy.
- GET requests only, using same-origin mode and the existing session. External
  item URLs are rejected and cross-origin redirects fail. Live values stay in
  memory and are not persisted in localStorage/sessionStorage.
- Object, raw, embedded and profile frames are requested. Missing/forbidden raw
  data is reported, not bypassed. Optional page/columns/expand frames are supported.
- Source links are allowlisted identifiers such as `encoded/types/tissue.py`,
  not arbitrary filesystem paths. Only indexed Python/JSON files can be viewed.
- Model, source and asset responses use private, no-store caching. The native ES
  module follows the portal CSP and uses no eval. Requests enforce same-origin
  access. Each mount has isolated state/events; unmount aborts pending requests
  and clears its DOM and timers. Shadow DOM is style isolation, not a security boundary.
- Static analysis and provenance remain approximations: review diagnostics and
  validate subtype conditions, domain meaning and calculated-property behavior.

## Maintenance and validation

The assets/analyzer are a vendored baseline with a browser adapter (`portal.js`),
portal source paths, a light theme and mount-local events. `native.js` wraps the
packaged scripts in a mount/dispose lifecycle; the backend assembles this trusted
code and markup on demand, without adding it to the main webpack bundle. Do not blindly copy
new extension releases over these adaptations. Upstream fixes should be reviewed
and ported to both consumers; future shared packaging can eliminate duplication.

Standalone backend tests (no PostgreSQL/OpenSearch fixtures):

```sh
PYTHONPATH=src python -m unittest discover -s tests/schema_explorer -v
```

Optional real-browser regression test (Playwright/Chromium test tooling must be
available; it is not a portal runtime dependency):

```sh
python -m encoded.schema_explorer /tmp/schema-explorer.json
node tests/schema_explorer/browser.cjs /tmp/schema-explorer.json
```

`PLAYWRIGHT_MODULE` can point to an existing Playwright installation, and
`CHROME_PATH` can select an installed Chrome executable. All network responses in
this test are local fixtures; no environment credentials or real item data are used.
