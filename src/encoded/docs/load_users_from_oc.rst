Loading OC users
================

``load-users-from-oc`` reads the OC CSV format documented at the top of
``src/encoded/commands/load_users_from_oc.py``. Export with the header intact:
column 5 must be Email; the first ten columns are required. The associate column
is optional. UTF-8 CSVs with a BOM, blank rows, and mixed-case Yes/No values are
supported. Invalid names, emails, flags, or short rows abort preflight before
writes. All rows for a duplicate email are excluded, including active/revoked
conflicts; each is warned about as it is read and listed again in the final
summary. Duplicates do not stop the run or change the exit status. Revoked rows are never created; in update modes they remove
membership (see `Revoked rows`_).

Select exactly one mode:

* ``--create-new``: create only users whose lookup returns HTTP 404. Other lookup
  errors abort creation before any POST. Existing accounts are never patched.
* ``--update-changed``: patch existing current users only when managed values
  differ. Link ordering alone is not a change.
* ``--update-all``: issue one PATCH per existing current user, including an empty
  patch when everything already matches. Do not create missing users or restore
  inactive, revoked, or deleted accounts.

Both update modes also clear revoked rows' existing users (see below).

Always select the intended ``--env`` explicitly: the default is ``data``.
Start with ``--validate-only --verbose`` alongside the desired mode to inspect
POST/PATCH bodies and deletion parameters without persisting changes. Verbose
output alone is **not** a dry run. Both environment and batch confirmation are
required before writes.

Managed values
--------------

Creation sets names, email, submission_centers, consortia, submits_for, and dbgap
membership where applicable. Updates manage **only** submission_centers,
consortia, submits_for, and dbgap membership; they do not change names.

* Center codes are comma-split, trimmed, lowercased, deduplicated, and validated
  individually. ``dac`` maps to ``smaht_dac``; ``nih`` and empty tokens do not
  produce links. Aliases/UUIDs are compared using their resolved identifiers.
* The spreadsheet is the source of truth for submission_centers: when the
  listed centers differ from the user's, updates **replace** them, including
  any centers added by hand. A blank, NIH-only, or empty-token center cell
  **removes** the submission_centers property (``delete_fields``). Link
  ordering alone is not a change. Center affiliation is independent of Data
  submitter: a user can belong to a center without submission rights.
* Every user receives ``smaht`` consortium membership. Associates additionally
  receive ``smaht_associate``. An explicit associate No removes only that extra
  tag; unrelated consortium memberships are preserved. Moving between full and
  associate membership never removes centers by itself. Associates who end up
  with submission centers are printed as ``MANUAL REVIEW`` lines and in the
  final summary, because that combination is unusual and access-sensitive.
* Data submitter Yes grants the listed centers; No removes submission rights,
  **except that DAC members always retain the historical smaht_dac grant**.
* DUA signed Yes adds ``dbgap``; No removes it without removing other groups.
* Blank flags (including an absent associate column) preserve existing managed
  values during updates. A missing center with submitter Yes or blank also
  preserves existing submission rights (but still removes submission_centers).
  Use explicit No for deliberate removal, rather than relying on incomplete
  spreadsheet data.

Revoked rows
------------

``Revoked=Yes`` means the person has left consortium membership. It does not
change the portal account's ``status``. In ``--update-changed`` and
``--update-all``, an existing user whose status is current, inactive, or
revoked receives one PATCH that deletes every present ``groups``,
``consortia``, ``submission_centers``, and ``submits_for`` property. This is
the exception to the preservation rules above: admin groups and unrelated
consortia are removed too. The row's other columns, including its center, are
ignored and not validated.

* Users whose portal status is ``deleted`` are ignored.
* Missing users are skipped; ``--create-new`` never looks up or creates revoked
  rows.
* ``--update-changed`` skips a revoked user with nothing left to remove;
  ``--update-all`` still sends its one (possibly empty) PATCH.
* Malformed (non-list) existing values stop that user's PATCH.

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
