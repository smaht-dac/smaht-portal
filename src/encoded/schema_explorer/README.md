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
and missing-reverse-link proposals. Both diagram views support PNG export. Relationship dialogs describe the scientific role and scope of a connection,
with a compact field, source/target and multiplicity line. Curated interpretations
are restricted to known field paths and target types. Exact fields, JSON and source definitions remain under Technical details;
unrecognized relationships use the model description without inferred research advice.

The opening map is a research-oriented **From donor to data** overview. It explains
11 concepts using 10 labeled connections: donor, source material, sample, analyte,
library, FileSet, data files, analysis context, workflow execution, quality assessment
and sequencing. Numbered steps and the six main arrows follow biological progression from donor
to data, with forward-reading labels. Branches show experimental/analysis context.
This entry-map projection does not alter schema references: relationship cards,
inspectors and detailed diagrams retain the actual reference direction. Related schemas are grouped into concepts,
so a concept is not a claim that all its member schemas have every displayed field.

The projection in `research-map.js` uses only direct references present in the
current model and enabled types. For example, the source-material-to-donor connection
contains actual `Tissue.donor` and `CellLine.donor` references; it does not invent
`SampleSource.donor`. Missing references are omitted. **Trace a file to its donor**
highlights the available File → FileSet → Library → Analyte → Sample → source-material
→ Donor chain. Processing and quality branches remain visible but subdued.

Selecting a concept folds the overview and focuses the main exploration workspace.
Its prominent heading and explanation lead into relationship cards organized around
research questions. Cards describe the connection, list its fields, count distinct
schema types, and expand all exact definitions inline. The schema sidebar includes
each type's description and opens its model details. Explicit abstract collections
appear first under Abstract types, with an Abstract badge, italic name and dashed
card border; concrete schemas follow in their own group. Inspect fields & sources opens
the source inspector. Explore concept connections opens a scoped diagram containing the concept schemas
and their direct neighbors within the same domain under the active filters.
Concept detail cards are derived from all enabled direct references, including
preparation and supporting metadata, rather than only the overview's curated arrows.
For a single-schema concept, external endpoints from these same cards appear as
compact cards marked Other group, without expanding their domains. Multi-schema
concepts retain the approved group layout and explicitly list external overview
relationships above the canvas, with access to their exact relationship details.
Single-schema concepts stay highlighted. Shared definitions remain combined; external
domains stay behind the selected node’s External connections popover. Show entire group explicitly expands to
the full domain, with a switch back to the direct connections. Back to the concept
overview restores the selected concept workspace.
Explore another concept switches the workspace; Back to overview
restores the map, and Show overview reveals it without closing the workspace.
The file-provenance action keeps the map expanded so its highlighted path stays visible.
Selecting an arrow or label also opens its exact field and source definitions. Clinical details,
preparation/instruments, reference metadata and administrative schemas remain
available through context navigation. The relationship overview supports search,
pan/zoom, full screen, keyboard access and PNG export.

**All schemas** in the overview opens the complete group directory. Each enabled
type name remains accessible there. Group headings open the detailed hierarchical
diagram, and selecting a type opens its group and highlights that type.
**Metadata map** returns to the research overview. The advanced Layout menu retains
Network as an alternative to Hierarchical.

Inside a selected group, stages are packed into columns or rows to match the canvas
aspect ratio. The layout searches stage widths and node columns, minimizing unused
space while preserving biological stage order through numbered headings. Base types
occupy a separate strip above the stages. Automatic framing keeps a readable minimum scale; large diagrams can be panned,
while **Fit all** explicitly fits the entire content. Typography uses smaller
node and section labels independently of camera framing. Group changes and clearing selection never restore another group's zoom.

Explicit biological stages and base types are configured in `domains.js`.
Unmapped future types appear in Other types. Stages describe biological navigation,
not schema inheritance, access rules, or mandatory processing order.
Group filters do not limit planner searches.

Detailed hierarchical groups default to **Connections → Shared definitions**.
A field inherited unchanged is drawn once at its highest visible ancestor that
actually defines the same reference. Both field schema and provenance must match;
overrides, independent mixins and hidden ancestors remain separate. Shared arrows
retain every original subtype reference in the inspector. Node captions describe their role; stage colors appear only beside stage headings.
Abstract types use a dashed outline and an Abstract badge. Full descriptions and
field counts remain in tooltips; inheritance details appear for the selected type. Self-references appear on selection or in **All references**.
Selecting a type restores its exact visible incident references without moving nodes.
The router handles only displayed connections and distributes attachment points to
reduce arrowhead stacking. Network and compact item diagrams keep their full graph.

Only direct Link relationships are enabled initially in the main map. Calculated
and Reverse relationships remain available in Relationships; compact item diagrams
retain their existing default filters. Hierarchical arrows retain schema reference
direction and use rounded orthogonal paths around nodes and stage/group headings.
Dragging a node recalculates paths. Node selection preserves placement and camera;
changing Group or Layout clears manual positions. The original force layout remains
available as **Layout → Network**; neighborhood and compact layouts are unchanged.

Click a canvas group heading or use Group to focus it. Search spans all types and
opens the matching group when needed. Cross-group edges are hidden except those
incident to the selected type when Include cross-group links is enabled.
Selecting a type reveals an **External connections** badge attached to the node.
Clicking it opens an adjacent panel inside the canvas, with group names and distinct
connected-schema counts under the active relationship filters. Administrative groups consisting only of User,
Consortium and SubmissionCenter are omitted from the popover and badge count. If
another administrative schema is connected, the complete group remains visible.
The full neighborhood and schema relationships retain these references. Expanding a group
lists compact schema rows with incoming/outgoing direction and readable field labels.
Only one group expands at a time. Header and footer controls remain visible while
the list scrolls; exact field paths remain in tooltips and relationship details. The close button or Escape dismisses
the panel and returns focus to the badge. No page scrolling, node movement or camera
change is needed. Schema buttons navigate to the peer's group; Inspect relationship
opens its explanation. **Show all connected schemas** opens the neighborhood view
and reveals connected types hidden in Types. The badge follows dragged nodes and is
included in PNG export; it is omitted when the neighborhood is already visible.
Show neighborhood includes direct neighbors across group boundaries.

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

Authorization and credential fields are omitted from the Explorer model response
(including nested schema definitions, embeds and relationships) and live-item
display data. `display-policy.json` is shared by the backend presentation filter
and frontend live-data filter. Domain fields such as `donor_groups` and
`file_access_status` remain visible. This is a presentation policy, not a change
to item permissions or the underlying item APIs. The source viewer still shows
the indexed source files; it is not a redacted-source interface.

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
node tests/schema_explorer/domains.cjs /tmp/schema-explorer.json
node tests/schema_explorer/research-map.cjs /tmp/schema-explorer.json
node tests/schema_explorer/concept-connections.cjs /tmp/schema-explorer.json
node tests/schema_explorer/relationship-view.cjs /tmp/schema-explorer.json
node tests/schema_explorer/node-presentation.cjs
node tests/schema_explorer/browser.cjs /tmp/schema-explorer.json
```

Build the portal JS and SCSS first. The browser test uses Playwright/Chrome with
local fixtures, including React mount/unmount, the schema map, source modal, PNG,
planner and same-origin live items. `PLAYWRIGHT_MODULE`, `CHROME_PATH` and `PYTHON`
can select local test tooling. The endpoint tests do not require database fixtures.
