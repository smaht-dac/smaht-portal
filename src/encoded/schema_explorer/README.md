# Portal Schema Explorer

Open `/schema-explorer`, or choose **Schema Explorer** in the account menu.
Access follows the `schema-explorer` Page item's normal `view` permission, including
its status and local roles. The model/source APIs and account menu check that same
Page on every request. Only admins see the Live item explorer. Live item requests
use the current browser session and retain the normal item permissions.

## Page content and deployment

Like data-matrix, this is a Page with a JSX StaticSection. There is no custom
`/schema-explorer` page route or `SchemaExplorerPage` content-view registration.
`docs/public/schema_explorer.jsx` renders the registered `SchemaExplorerSection`
placeholder through the existing StaticPage renderer.

Load these two records from `tests/data/master-inserts` when deploying to an
existing database (a server restart alone does not create content items):

1. StaticSection `schema-explorer-content`, UUID `efb34110-5618-451c-a78d-56ab24edba48`.
2. Page `schema-explorer`, UUID `b683617f-f78b-48eb-8d2b-f620bc753f4e`.

Both start with `protected-network`, matching data-matrix. Manage visibility with
the normal Page/status controls; keep the linked StaticSection readable by the
intended audience as well. Do not overwrite an existing Page's status on redeploy.
If the Page is missing or inaccessible, the APIs deny access, even when a model
snapshot is already cached. Making the Page public also permits public access to
the indexed model and source definitions; Live item explorer remains admin-only.

## Frontend

The page uses ordinary React components under
`static/components/static-pages/schema-explorer`. Webpack loads the UI as a
route-specific chunk. Styles are scoped by `.schema-explorer` and
`.schema-explorer-modal` in the portal SCSS build. React owns all selections,
filters, dialogs, SVG nodes and item values. There is no iframe, Shadow DOM,
HTML/script assembly endpoint or VS Code messaging adapter. No npm dependencies
were added.

The initial view is **All schemas**, with no item type selected. User, Consortium
and SubmissionCenter types are hidden by default. The neighborhood control toggles between
the selected type's immediate neighbors and the enabled types. Item view includes
field/embedding searches, inheritance, source inspection, navigation history and
live provenance. The planner preserves ranking, subtype conditions, search bounds
and missing-reverse-link proposals. Both diagram views support PNG export.

Model/source reads use the portal AJAX utility. Live item reads use same-origin
fetch to reject cross-origin redirects as well as external input URLs. Components
cancel requests and remove listeners on unmount. No live data is stored in browser
storage. The old `/schema-explorer/ui` URL only redirects to the portal page;
`/schema-explorer/assets/*` endpoints have been removed.

Session management belongs to the portal, not to Explorer. Explorer uses the
existing authentication and rendering pipeline without custom session callbacks
or changes to the shared renderer.

## Model lifecycle

The deployed `encoded`, `encoded_core` and `snovault` sources are analyzed once on
the first authorized request per worker, then cached under a lock. Modules are
parsed, not executed. Restart the worker after source changes; **Refresh** reloads
the deployed snapshot, not local source edits.

Optionally precompute with:

```sh
python -m encoded.schema_explorer /path/to/schema-explorer.json
```

Set `schema_explorer.artifact` in the server INI to use this artifact. Generate it
in the environment/image that will serve it. It contains model metadata and source
code, so it must not be placed in a public static directory.

## Data and security

- No keys file, environment selector or server-side request proxy.
- GET requests only. Raw/object/embedded/profile and optional page/columns/expand
  frames preserve the current user's permissions; unavailable frames are reported.
- Source identifiers are an index allowlist, never arbitrary filesystem paths.
- Model/source responses are private and no-store. Source text and item values are
  rendered as React text, never as HTML.
- Static analysis and provenance are approximations. Validate subtype conditions,
  domain meaning and calculated behavior before changing schemas or embeds.

## Validation

```sh
PYTHONPATH=src python -m unittest discover -s tests/schema_explorer -v
python -m encoded.schema_explorer /tmp/schema-explorer.json
node tests/schema_explorer/browser.cjs /tmp/schema-explorer.json
```

Build the portal JS and SCSS first. The browser test uses Playwright/Chrome with
local fixtures, including React mount/unmount, the schema map, source modal, PNG,
planner and same-origin live items. `PLAYWRIGHT_MODULE`, `CHROME_PATH` and `PYTHON`
can select local test tooling. The endpoint tests do not require database fixtures.
