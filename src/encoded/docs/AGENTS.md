# docs/ agent memory

Durable, non-obvious knowledge specific to `src/encoded/docs/` and adjacent tooling that
reads/writes schema-derived documentation or spreadsheets. See the top-level `AGENTS.md`/
`CLAUDE.md` for repo-wide knowledge; keep entries here scoped to this subtree.

## `/submission-schemas/` silently drops fields that admin-facing tools may still need

`src/encoded/commands/write_submission_spreadsheets.py` normally builds spreadsheet columns
from `/submission-schemas/<item>.json` (`SubmissionSchemaConstants.ENDPOINT`), which is
filtered by `snovault.schema_views._get_submittable_schema` for *external* submitters. Per
`SMaHTProjectSchemaViews.get_properties_for_exclusion()`
(`src/encoded/project/schema_views.py`), this endpoint unconditionally drops `accession`,
`uuid`, `submission_centers`, `consortia`, `status`, `schema_version`, `date_created`,
`submitted_by`, and `principals_allowed` for every item, and also drops the `required` list
of nested array-item objects (see `snovault.schema_views._build_embedded_obj`) — it keeps
`items.properties` but not `items.required`. A tool built for admins (not external
submitters) that needs any of the above must instead fetch the raw, non-filtered schema via
`/profiles/<item>.json` and derive required-ness itself from that schema's own `required`
list(s), since raw profile properties carry no precomputed `is_required` annotation at all.
See `get_raw_profile_schema`/`get_curated_properties`/`get_object_required` in
`write_submission_spreadsheets.py` for the pattern, and
`src/encoded/tests/test_write_submission_spreadsheets.py` for regression coverage.
