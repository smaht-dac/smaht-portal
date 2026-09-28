Loading OC users
================

``load-users-from-oc`` reads the OC CSV format documented at the top of
``src/encoded/commands/load_users_from_oc.py``. Export with the header intact:
column 5 must be Email; the first ten columns are required. The associate column
is optional. UTF-8 CSVs with a BOM, blank rows, and mixed-case Yes/No values are
supported. Invalid names, emails, flags, or short rows abort preflight before
writes. All rows for a duplicate email are excluded, including active/revoked
conflicts. Revoked rows are skipped, not used to revoke portal accounts.

Select exactly one mode:

* ``--create-new``: create only users whose lookup returns HTTP 404. Other lookup
  errors abort creation before any POST. Existing accounts are never patched.
* ``--update-changed``: patch existing current users only when managed values
  differ. Link ordering alone is not a change.
* ``--update-all``: issue one PATCH per existing current user, including an empty
  patch when everything already matches. Do not create missing users or restore
  inactive, revoked, or deleted accounts.

Always select the intended ``--env`` explicitly: the default is ``data``.
Start with ``--validate-only --verbose`` alongside the desired mode to inspect
POST/PATCH bodies and deletion parameters without persisting changes. Verbose
output alone is **not** a dry run. Both environment and batch confirmation are
required before writes.

Managed values
--------------

Creation sets names, email, submission_centers, consortia, submits_for, and dbgap
membership where applicable. Updates manage **only** consortia, submits_for,
and dbgap membership; they do not change names or submission_centers.

* Center codes are comma-split, trimmed, lowercased, deduplicated, and validated
  individually. ``dac`` maps to ``smaht_dac``; ``nih`` and empty tokens do not
  produce links. Aliases/UUIDs are compared using their resolved identifiers.
* Every user receives ``smaht`` consortium membership. Associates additionally
  receive ``smaht_associate``. An explicit associate No removes only that extra
  tag; unrelated consortium memberships are preserved.
* Data submitter Yes grants the listed centers; No removes submission rights,
  **except that DAC members always retain the historical smaht_dac grant**.
* DUA signed Yes adds ``dbgap``; No removes it without removing other groups.
* Blank flags (including an absent associate column) preserve existing managed
  values during updates. A missing center with submitter Yes or blank also
  preserves existing submission rights. Use explicit No for deliberate removal,
  rather than relying on incomplete spreadsheet data.

Requests and failure handling
-----------------------------

Reads request embedded database-backed data rather than relying on a stale
search index. Unchanged fields are omitted from patches. Writes are not retried
or redirected: a timeout can occur after a successful commit, so inspect any
ambiguous outcome before rerunning. Caught processing failures produce a nonzero
exit status; subsequent update rows can still succeed. Each user's additions
and deletions are sent in one validated PATCH. Coordinate live administrator
edits: this command does not provide a transaction across users or a server-side
compare-and-swap for changed list fields.

Offline regression coverage is in ``test_load_users_from_oc.py`` and
``test_load_users_from_oc_safety.py`` under ``src/encoded/tests/``. These use
mocked portal operations and must not be pointed at a real portal.
