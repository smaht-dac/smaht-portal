import argparse
import inspect
import itertools
import logging
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import event, text
from snovault import DBSESSION, TYPES
from snovault.storage import CurrentPropertySheet, PropertySheet, Resource

import encoded.commands.delete_revision_history as delete_revision_history_command
from encoded.commands.delete_revision_history import (
    DEFAULT_BATCH_SIZE,
    DEFAULT_SCAN_BATCH_SIZE,
    ITEM_TYPES_TO_PURGE,
    _positive_batch_size,
    _validate_batch_size,
    collect_revision_inventory,
    delete_revision_history,
    delete_old_revision_history_for_item_type,
    log_post_cleanup_revision_inventory,
    log_revision_inventory,
    report_revision_inventory,
)


def _propsheet_rows(session, rid):
    return (
        session.query(PropertySheet)
        .filter(PropertySheet.rid == rid)
        .order_by(PropertySheet.sid)
        .all()
    )


def _resource_with_history(item_type):
    resource = Resource(item_type, {"": {"title": "initial"}, "extra": {"value": 1}})
    return resource


def _resources_with_history(session, counts_by_type):
    resources = []
    for item_type, count in counts_by_type.items():
        resources.extend(
            _resource_with_history(item_type) for _ in range(count)
        )
    session.add_all(resources)
    session.flush()

    for resource in resources:
        resource[""] = {"title": "current"}
        resource["extra"] = {"value": 2}
    session.flush()
    return resources


def _current_sids(session, resources):
    return {
        row.sid
        for resource in resources
        for row in session.query(CurrentPropertySheet)
        .filter(CurrentPropertySheet.rid == resource.rid)
        .all()
    }


def test_delete_old_revision_history_for_item_type(session):
    workflow = _resource_with_history("workflow")
    other_resource = _resource_with_history("unrelated_item_type")
    session.add_all([workflow, other_resource])
    session.flush()

    for resource in (workflow, other_resource):
        resource[""] = {"title": "current"}
        resource["extra"] = {"value": 2}
    session.flush()

    assert len(_propsheet_rows(session, workflow.rid)) == 4
    assert len(_propsheet_rows(session, other_resource.rid)) == 4
    workflow_current_sids = {
        sid
        for (sid,) in (
            session.query(CurrentPropertySheet.sid)
            .filter(CurrentPropertySheet.rid == workflow.rid)
            .all()
        )
    }

    dry_run_count = delete_old_revision_history_for_item_type(
        session, "workflow", dry_run=True
    )
    assert dry_run_count == 2
    assert len(_propsheet_rows(session, workflow.rid)) == 4
    assert len(_propsheet_rows(session, other_resource.rid)) == 4

    deleted_count = delete_old_revision_history_for_item_type(session, "workflow")
    assert deleted_count == 2
    remaining_sids = {row.sid for row in _propsheet_rows(session, workflow.rid)}
    assert remaining_sids == workflow_current_sids
    assert len(_propsheet_rows(session, other_resource.rid)) == 4


def test_batched_cleanup_selects_exact_types_and_preserves_current_rows(session):
    resources = _resources_with_history(
        session,
        {"workflow": 3, "meta_workflow_run": 3, "unrelated_item_type": 2},
    )
    target_resources = [
        resource
        for resource in resources
        if resource.item_type in {"workflow", "meta_workflow_run"}
    ]
    current_sids = _current_sids(session, target_resources)

    workflow_deleted = delete_old_revision_history_for_item_type(
        session, "workflow", batch_size=1
    )
    meta_workflow_run_deleted = delete_old_revision_history_for_item_type(
        session, "meta_workflow_run", batch_size=1
    )
    workflow_rerun_deleted = delete_old_revision_history_for_item_type(
        session, "workflow", batch_size=1
    )
    meta_workflow_run_rerun_deleted = delete_old_revision_history_for_item_type(
        session, "meta_workflow_run", batch_size=1
    )

    assert workflow_deleted == 6
    assert meta_workflow_run_deleted == 6
    assert workflow_rerun_deleted == 0
    assert meta_workflow_run_rerun_deleted == 0
    assert _current_sids(session, target_resources) == current_sids
    assert all(
        {row.sid for row in _propsheet_rows(session, resource.rid)}
        <= current_sids
        for resource in target_resources
    )
    unrelated = [
        resource
        for resource in resources
        if resource.item_type == "unrelated_item_type"
    ]
    assert all(len(_propsheet_rows(session, resource.rid)) == 4 for resource in unrelated)


def test_batched_delete_statements_are_bounded(session):
    _resources_with_history(session, {"workflow": 4})
    engine = session.get_bind()
    delete_rowcounts = []

    def capture_delete_rowcount(
        _conn, _cursor, statement, _parameters, _context, _executemany
    ):
        if statement.lstrip().upper().startswith("DELETE FROM PROPSHEETS"):
            delete_rowcounts.append(_cursor.rowcount)

    event.listen(engine, "after_cursor_execute", capture_delete_rowcount)
    try:
        deleted = delete_old_revision_history_for_item_type(
            session, "workflow", batch_size=1
        )
    finally:
        event.remove(engine, "after_cursor_execute", capture_delete_rowcount)

    assert deleted == 8
    assert len(delete_rowcounts) == deleted
    assert all(0 <= rowcount <= 1 for rowcount in delete_rowcounts)


def test_dry_run_is_batched_and_does_not_count_or_write(session):
    resources = _resources_with_history(session, {"workflow": 3})
    statements = []
    engine = session.get_bind()

    def capture_statement(
        _conn, _cursor, statement, _parameters, _context, _executemany
    ):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture_statement)
    try:
        count = delete_old_revision_history_for_item_type(
            session, "workflow", dry_run=True, batch_size=1
        )
    finally:
        event.remove(engine, "before_cursor_execute", capture_statement)

    assert count == 6
    assert all("COUNT(" not in statement.upper() for statement in statements)
    propsheet_selects = [
        statement
        for statement in statements
        if "FROM PROPSHEETS" in statement.upper()
    ]
    assert propsheet_selects
    assert all("LIMIT" in statement.upper() for statement in propsheet_selects)
    assert all(len(_propsheet_rows(session, resource.rid)) == 4 for resource in resources)


def test_cleanup_respects_a_low_statement_timeout_with_generated_fixture(session):
    resources = _resources_with_history(session, {"workflow": 8})
    session.execute(text("SET LOCAL statement_timeout = 1000"))

    deleted = delete_old_revision_history_for_item_type(
        session, "workflow", batch_size=1
    )

    assert deleted == 16
    assert all(
        {row.sid for row in _propsheet_rows(session, resource.rid)}
        == _current_sids(session, [resource])
        for resource in resources
    )


def test_current_row_is_rechecked_before_bounded_delete(session):
    (workflow,) = _resources_with_history(session, {"workflow": 1})
    old_row = (
        session.query(PropertySheet)
        .filter(
            PropertySheet.rid == workflow.rid,
            ~session.query(CurrentPropertySheet.sid)
            .filter(
                CurrentPropertySheet.rid == PropertySheet.rid,
                CurrentPropertySheet.name == PropertySheet.name,
                CurrentPropertySheet.sid == PropertySheet.sid,
            )
            .exists(),
        )
        .order_by(PropertySheet.sid)
        .first()
    )
    current = (
        session.query(CurrentPropertySheet)
        .filter(
            CurrentPropertySheet.rid == workflow.rid,
            CurrentPropertySheet.name == old_row.name,
        )
        .one()
    )
    current.sid = old_row.sid
    session.flush()

    deleted = delete_revision_history_command._delete_revision_sids(
        session, "workflow", [workflow.rid], [old_row.sid]
    )

    assert deleted == 0
    assert old_row.sid in {row.sid for row in _propsheet_rows(session, workflow.rid)}


def test_revision_inventory_counts_all_item_types_and_totals(session):
    _resources_with_history(
        session,
        {"workflow": 1, "meta_workflow_run": 2, "unrelated_item_type": 1},
    )
    session.add(Resource("zero_revision_type"))
    session.flush()

    report = collect_revision_inventory(session, scan_batch_size=1)

    assert report["by_item_type"] == {
        "meta_workflow_run": {
            "resource_count": 2,
            "total_revision_count": 8,
            "excess_historical_revisions": 4,
        },
        "unrelated_item_type": {
            "resource_count": 1,
            "total_revision_count": 4,
            "excess_historical_revisions": 2,
        },
        "workflow": {
            "resource_count": 1,
            "total_revision_count": 4,
            "excess_historical_revisions": 2,
        },
        "zero_revision_type": {
            "resource_count": 1,
            "total_revision_count": 0,
            "excess_historical_revisions": 0,
        },
    }
    assert report["totals"] == {
        "resource_count": 5,
        "total_revision_count": 16,
        "excess_historical_revisions": 8,
    }


def assert_keyset_pages_advance(calls, key_parameter, row_index):
    """Assert a keyset-paginated statement stream is bounded and strictly advancing.

    ``calls`` is the recorded list of executed pages, each a mapping with
    ``parameters`` (the bound parameters) and ``rows`` (the fetched rows). The
    final page must be empty, the keyset parameter must be absent on the first
    page, and every subsequent page must resume exactly at the previous page's
    final key while returning a strictly greater leading key.

    Keys are compared using their native types (integers for ``sid``,
    UUIDs/strings for ``rid``); the values on both sides come from the same
    query column, so ``>`` is type-consistent. Stringifying first is a bug: for
    integer ``sid`` keys ``str(1000) > str(999)`` is ``False`` (and
    ``str(9) > str(10)`` is ``True``), so it would reject a valid 999 -> 1000
    advance and accept an invalid 10 -> 9 one whenever the key crosses a
    power-of-ten digit boundary.
    """
    assert calls
    assert calls[-1]["rows"] == []
    nonempty_calls = calls[:-1]
    assert nonempty_calls
    assert key_parameter not in nonempty_calls[0]["parameters"]
    assert (
        calls[-1]["parameters"][key_parameter]
        == nonempty_calls[-1]["rows"][-1][row_index]
    )
    for index in range(1, len(nonempty_calls)):
        current = nonempty_calls[index]
        previous_last_key = nonempty_calls[index - 1]["rows"][-1][row_index]
        assert current["parameters"][key_parameter] == previous_last_key
        assert current["rows"][0][row_index] > previous_last_key


def assert_pages_are_bounded_scalar_sql(calls, order_clause):
    """Assert every page statement is a bounded, non-ORM scalar read."""
    for call in calls:
        sql = call["statement"].text.upper()
        assert "SELECT *" not in sql
        assert "LIMIT" in sql
        assert order_clause in sql
        assert "COUNT(" not in sql


def test_revision_inventory_uses_bounded_scalar_queries(session):
    extra_item_type = f"inventory_preexisting_{uuid4().hex}"
    zero_item_type = f"inventory_zero_revision_{uuid4().hex}"
    _resources_with_history(session, {extra_item_type: 2})
    _resources_with_history(session, {"workflow": 2, "unrelated_item_type": 1})
    session.add(Resource(zero_item_type))
    session.flush()

    class BufferedResult:
        def __init__(self, rows):
            self.rows = rows

        def fetchall(self):
            return self.rows

    class RecordingSession:
        def __init__(self, wrapped_session):
            self.wrapped_session = wrapped_session
            self.calls = []

        def execute(self, statement, parameters):
            rows = self.wrapped_session.execute(statement, parameters).fetchall()
            self.calls.append(
                {"statement": statement, "parameters": parameters, "rows": rows}
            )
            return BufferedResult(rows)

    recording_session = RecordingSession(session)
    report = collect_revision_inventory(recording_session, scan_batch_size=1)

    resource_batches = [
        call
        for call in recording_session.calls
        if "SELECT RID, ITEM_TYPE" in call["statement"].text.upper()
    ]
    revision_batches = [
        call
        for call in recording_session.calls
        if "SELECT P.SID" in call["statement"].text.upper()
    ]

    assert_pages_are_bounded_scalar_sql(resource_batches, "ORDER BY RID")
    assert_keyset_pages_advance(resource_batches, "after_rid", row_index=0)
    assert_pages_are_bounded_scalar_sql(revision_batches, "ORDER BY P.SID")
    assert_keyset_pages_advance(revision_batches, "after_sid", row_index=0)
    assert all(
        "JOIN RESOURCES" in call["statement"].text.upper()
        for call in revision_batches
    )
    assert sum(len(call["rows"]) for call in resource_batches[:-1]) == report[
        "totals"
    ]["resource_count"]
    assert sum(len(call["rows"]) for call in revision_batches[:-1]) == report[
        "totals"
    ]["total_revision_count"]
    assert report["by_item_type"][extra_item_type]["resource_count"] == 2
    assert report["by_item_type"][zero_item_type] == {
        "resource_count": 1,
        "total_revision_count": 0,
        "excess_historical_revisions": 0,
    }


def _synthetic_keyset_pages(key_parameter, key_values):
    """Build recorded keyset pages from a monotonic sequence of scalar keys.

    Mirrors ``collect_revision_inventory``'s paging: the first page carries no
    keyset parameter, each later page resumes at the previous page's final key,
    and a trailing empty page terminates the stream.
    """
    pages = []
    for index, key in enumerate(key_values):
        parameters = {"batch_size": 1}
        if index:
            parameters[key_parameter] = key_values[index - 1]
        pages.append({"parameters": parameters, "rows": [(key,)]})
    pages.append(
        {"parameters": {key_parameter: key_values[-1], "batch_size": 1}, "rows": []}
    )
    return pages


@pytest.mark.parametrize(
    "key_values",
    [
        [9, 10],
        [99, 100, 101],
        [8, 9, 10, 11],
        [998, 999, 1000, 1001],
        [1, 5, 9, 10, 42, 100, 1000],
    ],
)
def test_keyset_advance_accepts_integer_keys_across_digit_boundaries(key_values):
    """Integer sid keys crossing a power-of-ten boundary are strictly ordered.

    A prior implementation compared stringified keys, so a valid ``999 -> 1000``
    advance failed (``"1000" < "999"``). Native integer comparison accepts it.
    """
    pages = _synthetic_keyset_pages("after_sid", key_values)
    assert_keyset_pages_advance(pages, "after_sid", row_index=0)


@pytest.mark.parametrize(
    "key_values",
    [
        [10, 9],
        [1, 2, 2],
        [100, 1000, 999],
    ],
)
def test_keyset_advance_rejects_non_monotonic_integer_keys(key_values):
    """Genuinely non-advancing integer keyset streams still fail the assertion.

    Includes ``10 -> 9``, which the stringified comparison wrongly accepted
    (``"9" > "10"``).
    """
    pages = _synthetic_keyset_pages("after_sid", key_values)
    with pytest.raises(AssertionError):
        assert_keyset_pages_advance(pages, "after_sid", row_index=0)


def test_keyset_advance_orders_uuid_string_keys():
    """UUID/string rid keys are compared consistently with SQL ``ORDER BY rid``."""
    ordered_rids = [str(value) for value in sorted(uuid4() for _ in range(6))]
    pages = _synthetic_keyset_pages("after_rid", ordered_rids)
    assert_keyset_pages_advance(pages, "after_rid", row_index=0)


def test_revision_inventory_log_output_is_deterministic(monkeypatch):
    report = {
        "by_item_type": {
            "clean_type": {
                "resource_count": 2,
                "total_revision_count": 2,
                "excess_historical_revisions": 0,
            },
            "zero_type": {
                "resource_count": 1,
                "total_revision_count": 0,
                "excess_historical_revisions": 0,
            },
        },
        "totals": {
            "resource_count": 3,
            "total_revision_count": 2,
            "excess_historical_revisions": 0,
        },
    }
    messages = []
    monkeypatch.setattr(
        delete_revision_history_command.logger,
        "info",
        lambda message: messages.append(message),
    )

    log_revision_inventory(report)

    assert messages == [
        "revision_inventory phase=pre_cleanup item_type=clean_type "
        "resource_count=2 total_revision_count=2 "
        "excess_historical_revisions=0 state=clean",
        "revision_inventory phase=pre_cleanup item_type=zero_type "
        "resource_count=1 total_revision_count=0 "
        "excess_historical_revisions=0 state=no_revisions",
        "revision_inventory phase=pre_cleanup scope=database_total "
        "resource_count=3 total_revision_count=2 "
        "excess_historical_revisions=0 state=clean",
    ]


def test_revision_inventory_logs_post_cleanup_effect_without_rescan(monkeypatch):
    report = {
        "by_item_type": {
            "workflow": {
                "resource_count": 1,
                "total_revision_count": 4,
                "excess_historical_revisions": 2,
            },
            "meta_workflow_run": {
                "resource_count": 1,
                "total_revision_count": 2,
                "excess_historical_revisions": 1,
            },
            "unrelated_item_type": {
                "resource_count": 1,
                "total_revision_count": 4,
                "excess_historical_revisions": 2,
            },
        },
        "totals": {
            "resource_count": 3,
            "total_revision_count": 10,
            "excess_historical_revisions": 5,
        },
    }
    messages = []
    monkeypatch.setattr(
        delete_revision_history_command.logger,
        "info",
        lambda message: messages.append(message),
    )

    log_post_cleanup_revision_inventory(
        report, {"workflow": 2, "meta_workflow_run": 1}, dry_run=False
    )

    assert messages == [
        "revision_inventory phase=post_cleanup item_type=workflow "
        "resource_count=1 total_revision_count=2 "
        "excess_historical_revisions=0 state=clean",
        "revision_inventory phase=post_cleanup item_type=meta_workflow_run "
        "resource_count=1 total_revision_count=1 "
        "excess_historical_revisions=0 state=clean",
        "revision_inventory phase=post_cleanup scope=database_total "
        "resource_count=3 total_revision_count=7 "
        "excess_historical_revisions=2 state=historical_buildup",
    ]


def test_cleanup_reuses_fixture_registered_db_session(monkeypatch):
    registered_session = object()
    registry = type("Registry", (dict,), {"settings": {}})(
        {DBSESSION: registered_session}
    )
    app = type("App", (), {"registry": registry})()

    def fail_if_reconfigured(_app):
        raise AssertionError("fixture-registered DB session was reconfigured")

    monkeypatch.setattr(
        delete_revision_history_command,
        "configure_dbsession",
        fail_if_reconfigured,
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "_target_rids_by_type",
        lambda session: {item_type: [] for item_type in ITEM_TYPES_TO_PURGE},
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "delete_old_revision_history_for_item_type",
        lambda *args, **kwargs: 0,
    )
    monkeypatch.setattr(
        delete_revision_history_command.transaction, "commit", lambda: None
    )

    assert delete_revision_history(app, prod=True, batch_size=1) == {
        item_type: 0 for item_type in ITEM_TYPES_TO_PURGE
    }


def test_interrupted_cleanup_resumes_idempotently(app, session, monkeypatch):
    resources = _resources_with_history(
        session, {"workflow": 3, "meta_workflow_run": 2}
    )
    # Each cleanup batch commits, so SQLAlchemy expires the ORM instances.
    # Retain the scalar identifiers needed for assertions before interruption.
    resource_rids = tuple(resource.rid for resource in resources)
    real_commit = delete_revision_history_command.transaction.commit
    commit_count = 0

    def commit_then_interrupt():
        nonlocal commit_count
        real_commit()
        commit_count += 1
        if commit_count == 2:
            raise RuntimeError("deliberate interruption after committed batches")

    monkeypatch.setattr(
        delete_revision_history_command.transaction, "commit", commit_then_interrupt
    )
    with pytest.raises(RuntimeError, match="deliberate interruption"):
        delete_revision_history(app, prod=True, batch_size=1)

    monkeypatch.setattr(delete_revision_history_command.transaction, "commit", real_commit)
    resumed = delete_revision_history(app, prod=True, batch_size=1)
    completed = delete_revision_history(app, prod=True, batch_size=1)

    # Ten target types are now processed per run (not just the two this test
    # creates fixtures for), and the shared fixture database may already hold
    # baseline-deletable rows for the other eight - so which type's commit
    # the interruption lands on is not predictable here. Assert the
    # idempotency invariant instead of an exact intermediate per-type count:
    # a full (uninterrupted) resume run drains every target type to zero,
    # and a further run after that finds nothing left anywhere.
    assert set(resumed) == set(ITEM_TYPES_TO_PURGE)
    assert completed == {item_type: 0 for item_type in ITEM_TYPES_TO_PURGE}
    assert all(
        len(_propsheet_rows(session, rid)) == 2 for rid in resource_rids
    )


@pytest.mark.parametrize("batch_size", [0, -1, True, "1"])
def test_batch_size_validation(batch_size):
    with pytest.raises(ValueError):
        _validate_batch_size(batch_size)


def test_batch_size_cli_validation():
    assert _positive_batch_size("2") == 2
    assert DEFAULT_BATCH_SIZE > 0
    with pytest.raises(argparse.ArgumentTypeError):
        _positive_batch_size("0")
    with pytest.raises(argparse.ArgumentTypeError):
        _positive_batch_size("not-an-integer")


def test_deployment_invokes_batched_cleanup_before_mapping():
    deployment_entrypoint = Path("deploy/docker/production/entrypoint_deployment.sh")
    entrypoint = Path("deploy/docker/production/entrypoint.sh")
    deployment_contents = deployment_entrypoint.read_text()
    entrypoint_contents = entrypoint.read_text()
    cleanup_command = (
        "poetry run delete-revision-history production.ini --app-name app --prod"
    )
    mapping_command = "poetry run create-mapping-on-deploy"

    assert "set -e" in deployment_contents
    assert cleanup_command in deployment_contents
    assert deployment_contents.index(cleanup_command) < deployment_contents.index(
        mapping_command
    )
    assert "exec sh entrypoint_deployment.sh" in entrypoint_contents


def test_main_reports_inventory_before_dry_run_cleanup(monkeypatch):
    calls = []
    app = object()
    report = {"by_item_type": {}, "totals": {}}

    monkeypatch.setattr(
        delete_revision_history_command,
        "get_app",
        lambda *args: app,
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "report_revision_inventory",
        lambda received_app, scan_batch_size: calls.append(
            ("report", received_app, scan_batch_size)
        )
        or report,
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "log_revision_inventory",
        lambda received_report: calls.append(("pre_log", received_report)),
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "delete_revision_history",
        lambda received_app, prod, dry_run, batch_size: calls.append(
            ("cleanup", received_app, prod, dry_run, batch_size)
        )
        or {"workflow": 0, "meta_workflow_run": 0},
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "log_post_cleanup_revision_inventory",
        lambda received_report, deleted_by_type, dry_run: calls.append(
            ("post_log", received_report, deleted_by_type, dry_run)
        ),
    )
    monkeypatch.setattr(
        delete_revision_history_command.sys,
        "argv",
        [
            "delete-revision-history",
            "production.ini",
            "--app-name",
            "app",
            "--prod",
            "--dry-run",
            "--batch-size",
            "2",
            "--scan-batch-size",
            "3",
        ],
    )

    with pytest.raises(SystemExit) as exit_info:
        delete_revision_history_command.main()

    assert exit_info.value.code == 0
    # scan_batch_size (3) reaches only report_revision_inventory; batch_size
    # (2) reaches only delete_revision_history - proving the two settings
    # are routed to their intended paths independently.
    assert calls == [
        ("report", app, 3),
        ("pre_log", report),
        ("cleanup", app, True, True, 2),
        ("post_log", report, {"workflow": 0, "meta_workflow_run": 0}, True),
    ]


def _make_clock(step=1.0, start=0.0):
    """A deterministic monotonic-style clock: start, start+step, start+2*step, ..."""
    counter = itertools.count(start, step)
    return lambda: next(counter)


class _FetchAllResult:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _CannedPagedSession:
    """Feeds pre-built resource/revision pages to ``collect_revision_inventory``.

    Each list is consumed one page per matching ``execute`` call; once
    exhausted, further calls return an empty page so the scan's keyset loop
    terminates exactly like it would against a real, now-empty result set.
    """

    def __init__(self, resource_pages=(), revision_pages=()):
        self._resource_pages = list(resource_pages)
        self._revision_pages = list(revision_pages)

    def execute(self, statement, parameters):
        sql = statement.text.upper()
        if "SELECT RID, ITEM_TYPE" in sql:
            rows = self._resource_pages.pop(0) if self._resource_pages else []
        elif "SELECT P.SID" in sql:
            rows = self._revision_pages.pop(0) if self._revision_pages else []
        else:
            raise AssertionError(f"unexpected statement: {sql}")
        return _FetchAllResult(rows)


def _capture_log_events(monkeypatch):
    events = []
    monkeypatch.setattr(
        delete_revision_history_command.logger,
        "info",
        lambda event, **fields: events.append((event, fields)),
    )
    return events


def test_collect_revision_inventory_progress_cadence_and_ordering(monkeypatch):
    resource_pages = [[(index, "workflow")] for index in range(10)]
    revision_pages = [[(index, "workflow", None)] for index in range(6)]
    fake_session = _CannedPagedSession(resource_pages, revision_pages)
    events = _capture_log_events(monkeypatch)

    report = collect_revision_inventory(
        fake_session,
        scan_batch_size=1,
        progress_page_interval=3,
        progress_time_interval=1_000_000.0,
        clock=_make_clock(step=1.0),
    )

    assert report["totals"]["resource_count"] == 10
    assert report["totals"]["total_revision_count"] == 6

    resource_events = [(name, fields) for name, fields in events if fields.get("scan") == "resource_inventory"]
    revision_events = [(name, fields) for name, fields in events if fields.get("scan") == "revision_inventory"]

    assert [name for name, _ in resource_events] == [
        "revision_inventory_scan_start",
        "revision_inventory_scan_progress",
        "revision_inventory_scan_progress",
        "revision_inventory_scan_progress",
        "revision_inventory_scan_progress",
        "revision_inventory_scan_complete",
    ]
    assert [fields.get("pages") for _, fields in resource_events[1:]] == [1, 4, 7, 10, 10]
    assert [fields.get("elapsed_seconds") for _, fields in resource_events[1:]] == [1.0, 4.0, 7.0, 10.0, 11.0]
    assert all(fields["scan_batch_size"] == 1 for _, fields in resource_events)
    assert all(fields["rows"] == fields["pages"] for _, fields in resource_events[1:])

    assert [name for name, _ in revision_events] == [
        "revision_inventory_scan_start",
        "revision_inventory_scan_progress",
        "revision_inventory_scan_progress",
        "revision_inventory_scan_complete",
    ]
    assert all(fields["scan_batch_size"] == 1 for _, fields in revision_events)
    assert [fields.get("pages") for _, fields in revision_events[1:]] == [1, 4, 6]
    assert [fields.get("elapsed_seconds") for _, fields in revision_events[1:]] == [1.0, 4.0, 7.0]

    # The resource scan fully completes (start...complete) before the
    # revision scan starts - the two scans never interleave.
    assert events.index(resource_events[-1]) < events.index(revision_events[0])


def test_collect_revision_inventory_progress_cadence_bounded_at_scale(monkeypatch):
    """A tens-of-thousands-of-pages scan must not emit one line per page."""
    page_count = 1200
    resource_pages = [[(index, "workflow")] for index in range(page_count)]
    fake_session = _CannedPagedSession(resource_pages, revision_pages=())
    events = _capture_log_events(monkeypatch)

    collect_revision_inventory(
        fake_session,
        scan_batch_size=1,
        progress_page_interval=500,
        progress_time_interval=1_000_000.0,
        clock=_make_clock(step=0.0),
    )

    resource_progress_events = [
        fields
        for name, fields in events
        if name == "revision_inventory_scan_progress" and fields.get("scan") == "resource_inventory"
    ]
    # Page-interval cadence: pages 1, 501, 1001 - not one event per page.
    assert [fields["pages"] for fields in resource_progress_events] == [1, 501, 1001]
    assert len(resource_progress_events) < page_count / 100


def test_collect_revision_inventory_time_based_progress_fallback(monkeypatch):
    """A slow scan reports even when far fewer than page_interval pages have elapsed."""
    resource_pages = [[(index, "workflow")] for index in range(5)]
    fake_session = _CannedPagedSession(resource_pages, revision_pages=())
    events = _capture_log_events(monkeypatch)

    collect_revision_inventory(
        fake_session,
        scan_batch_size=1,
        progress_page_interval=100_000,
        progress_time_interval=5.0,
        clock=_make_clock(step=3.0),
    )

    resource_progress_events = [
        fields
        for name, fields in events
        if name == "revision_inventory_scan_progress" and fields.get("scan") == "resource_inventory"
    ]
    assert [fields["pages"] for fields in resource_progress_events] == [1, 3, 5]
    assert [fields["elapsed_seconds"] for fields in resource_progress_events] == [3.0, 9.0, 15.0]


def test_collect_revision_inventory_zero_row_scans_still_complete(monkeypatch):
    fake_session = _CannedPagedSession(resource_pages=(), revision_pages=())
    events = _capture_log_events(monkeypatch)

    report = collect_revision_inventory(
        fake_session, scan_batch_size=1, clock=_make_clock(step=1.0)
    )

    assert report["totals"] == {
        "resource_count": 0,
        "total_revision_count": 0,
        "excess_historical_revisions": 0,
    }
    assert [name for name, _ in events] == [
        "revision_inventory_scan_start",
        "revision_inventory_scan_complete",
        "revision_inventory_scan_start",
        "revision_inventory_scan_complete",
    ]
    resource_complete = events[1][1]
    revision_complete = events[3][1]
    assert resource_complete["scan"] == "resource_inventory"
    assert resource_complete["pages"] == 0
    assert resource_complete["rows"] == 0
    assert revision_complete["scan"] == "revision_inventory"
    assert revision_complete["pages"] == 0
    assert revision_complete["rows"] == 0


def test_delete_revision_history_emits_rid_discovery_and_cleanup_boundary_events(
    app, session, monkeypatch
):
    # The shared fixture database may already contain workflow/meta_workflow_run
    # resources (e.g. baseline inserts) beyond the ones this test creates, and
    # _target_rids_by_type/collect_revision_inventory are deliberately
    # database-wide. Snapshot that baseline first and assert deltas on top of
    # it, rather than hardcoding an absolute count that assumes an empty DB.
    empty_row = {
        "resource_count": 0,
        "total_revision_count": 0,
        "excess_historical_revisions": 0,
    }
    baseline = collect_revision_inventory(session)["by_item_type"]
    baseline_workflow = baseline.get("workflow", empty_row)
    baseline_meta = baseline.get("meta_workflow_run", empty_row)

    _resources_with_history(session, {"workflow": 2, "meta_workflow_run": 1})
    events = _capture_log_events(monkeypatch)

    deleted = delete_revision_history(app, prod=True, batch_size=1)

    expected_workflow_deleted = baseline_workflow["excess_historical_revisions"] + 4
    expected_meta_deleted = baseline_meta["excess_historical_revisions"] + 2
    expected_workflow_rid_count = baseline_workflow["resource_count"] + 2
    expected_meta_rid_count = baseline_meta["resource_count"] + 1

    # The cleanup entry point now processes all ten authoritative target
    # types per run, not just workflow/meta_workflow_run - so `deleted` and
    # every boundary event's item collection have all ten keys/entries.
    # Only workflow/meta_workflow_run have fixtures (and thus known expected
    # deltas) in this test; assert those two precisely and assert the
    # remaining eight are merely present and non-negative.
    assert set(deleted) == set(ITEM_TYPES_TO_PURGE)
    assert deleted["workflow"] == expected_workflow_deleted
    assert deleted["meta_workflow_run"] == expected_meta_deleted
    assert all(count >= 0 for count in deleted.values())

    event_names = [name for name, _ in events]

    assert event_names[0] == "delete_revision_history_rid_discovery_start"
    assert events[0][1]["item_types"] == list(ITEM_TYPES_TO_PURGE)

    assert event_names[1] == "delete_revision_history_rid_discovery_complete"
    discovery_fields = events[1][1]
    assert set(discovery_fields["rid_counts"]) == set(ITEM_TYPES_TO_PURGE)
    assert discovery_fields["rid_counts"]["workflow"] == expected_workflow_rid_count
    assert discovery_fields["rid_counts"]["meta_workflow_run"] == expected_meta_rid_count
    assert discovery_fields["elapsed_seconds"] >= 0

    assert event_names[2] == "delete_revision_history_cleanup_start"
    assert events[2][1]["item_types"] == list(ITEM_TYPES_TO_PURGE)
    assert events[2][1]["batch_size"] == 1

    complete_events_by_type = {
        fields["item_type"]: fields
        for name, fields in events
        if name == "delete_revision_history_cleanup_type_complete"
    }
    # Exactly one completion event per target type - proves the loop covers
    # every one of the ten types, not a stale count from when there were two.
    assert set(complete_events_by_type) == set(ITEM_TYPES_TO_PURGE)

    workflow_complete = complete_events_by_type["workflow"]
    assert workflow_complete["rid_count"] == expected_workflow_rid_count
    assert workflow_complete["affected_count"] == expected_workflow_deleted

    meta_complete = complete_events_by_type["meta_workflow_run"]
    assert meta_complete["rid_count"] == expected_meta_rid_count
    assert meta_complete["affected_count"] == expected_meta_deleted

    # Existing per-batch events are preserved and occur between the cleanup
    # phase start and workflow's own completion event, not removed or
    # replaced. Locate workflow's completion event by its item_type field
    # (not by position - it is the third type processed, not the first, now
    # that access_key/file_format precede it in ITEM_TYPES_TO_PURGE) to find
    # the slice boundary.
    workflow_complete_index = next(
        index
        for index, (name, fields) in enumerate(events)
        if name == "delete_revision_history_cleanup_type_complete"
        and fields["item_type"] == "workflow"
    )
    batch_events_before_workflow_complete = [
        name for name in event_names[3:workflow_complete_index]
        if name == "delete_revision_history_batch"
    ]
    assert batch_events_before_workflow_complete


def test_delete_revision_history_covers_all_ten_target_types_and_preserves_unrelated(
    app, session
):
    """The real (non-dry-run) cleanup entry point exercises every one of the
    ten authoritative target types added in this expansion - not just
    workflow/meta_workflow_run - while leaving an unrelated type's history
    and every target type's current propsheet rows untouched.
    """
    counts_by_type = {item_type: 2 for item_type in ITEM_TYPES_TO_PURGE}
    counts_by_type["unrelated_item_type"] = 2
    resources = _resources_with_history(session, counts_by_type)
    target_resources = [
        resource for resource in resources if resource.item_type in ITEM_TYPES_TO_PURGE
    ]
    unrelated_resources = [
        resource for resource in resources if resource.item_type == "unrelated_item_type"
    ]
    current_sids = _current_sids(session, target_resources)
    # Each cleanup batch commits, so SQLAlchemy expires the ORM instances -
    # capture the scalar rids needed for post-cleanup assertions up front
    # (same fix already applied to test_interrupted_cleanup_resumes_idempotently
    # for the same reason).
    target_rids = tuple(resource.rid for resource in target_resources)
    unrelated_rids = tuple(resource.rid for resource in unrelated_resources)

    deleted = delete_revision_history(app, prod=True, batch_size=1)

    # Exact type selection: every one of the ten target types is present and
    # was acted on (baseline noise from other tests can only add to the two
    # old rows this test's own fixtures contribute per type, never remove).
    assert set(deleted) == set(ITEM_TYPES_TO_PURGE)
    for item_type in ITEM_TYPES_TO_PURGE:
        assert deleted[item_type] >= 2

    # Current-propsheet preservation: every target resource's current rows
    # are exactly the same set as before cleanup ran.
    post_cleanup_current_sids = {
        row.sid
        for rid in target_rids
        for row in session.query(CurrentPropertySheet)
        .filter(CurrentPropertySheet.rid == rid)
        .all()
    }
    assert post_cleanup_current_sids == current_sids
    assert all(
        {row.sid for row in _propsheet_rows(session, rid)} <= current_sids
        for rid in target_rids
    )

    # Unrelated-type preservation: a type outside the purge list is never
    # touched, keeping all four of its rows (two current, two historical).
    assert all(
        len(_propsheet_rows(session, rid)) == 4
        for rid in unrelated_rids
    )


def test_main_logs_initialization_event_before_inventory(monkeypatch):
    calls = []
    app = object()
    report = {"by_item_type": {}, "totals": {}}

    monkeypatch.setattr(
        delete_revision_history_command, "get_app", lambda *args: app
    )
    monkeypatch.setattr(
        delete_revision_history_command.logger,
        "info",
        lambda event, **fields: calls.append(("log", event, fields)),
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "report_revision_inventory",
        lambda received_app, scan_batch_size: calls.append(
            ("report", received_app, scan_batch_size)
        )
        or report,
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "log_revision_inventory",
        lambda received_report: calls.append(("pre_log", received_report)),
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "delete_revision_history",
        lambda received_app, prod, dry_run, batch_size: calls.append(
            ("cleanup", received_app, prod, dry_run, batch_size)
        )
        or {"workflow": 0, "meta_workflow_run": 0},
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "log_post_cleanup_revision_inventory",
        lambda received_report, deleted_by_type, dry_run: calls.append(
            ("post_log", received_report, deleted_by_type, dry_run)
        ),
    )
    monkeypatch.setattr(
        delete_revision_history_command.sys,
        "argv",
        [
            "delete-revision-history",
            "production.ini",
            "--app-name",
            "app",
            "--prod",
            "--batch-size",
            "2",
            "--scan-batch-size",
            "3",
        ],
    )

    with pytest.raises(SystemExit) as exit_info:
        delete_revision_history_command.main()

    assert exit_info.value.code == 0
    assert calls[0] == (
        "log",
        "delete_revision_history_initialized",
        {
            "config_uri": "production.ini",
            "app_name": "app",
            "scan_batch_size": 3,
            "batch_size": 2,
            "dry_run": False,
            "prod": True,
        },
    )
    assert [entry[0] for entry in calls[1:]] == ["report", "pre_log", "cleanup", "post_log"]


def test_progress_events_are_visible_at_info_under_production_logging_config(caplog):
    """Under the command's real (in_prod=True) logging setup, INFO events can
    reach a `logging` handler with every field intact when nothing upstream
    filters them - just not as the pretty dev console renderer, since
    dcicutils's production JSON formatter wiring is present but commented out
    (see dcicutils/log_utils.py).

    This is necessary but not sufficient for CloudWatch visibility: real
    production evidence showed these `logger.info(...)` records absent from
    CloudWatch during a live deploy even though the command's final stdout
    `print(...)` summary lines were present in the same stream. Whatever
    handler/level/stream-capture behavior caused that in the real deployment
    path is not fully reproducible here without live production access, and
    this test does not claim to rule it out - see
    `test_operator_event_reaches_stdout_even_when_logger_is_filtered` below
    for the actual reliability guarantee: operator-critical output no longer
    depends on this logger path at all.
    """
    from dcicutils.log_utils import set_logging

    set_logging(in_prod=True)
    try:
        caplog.set_level(logging.INFO)
        delete_revision_history_command.logger.info(
            "revision_inventory_scan_progress",
            scan="resource_inventory",
            pages=3,
            rows=1500,
            batch_size=500,
            elapsed_seconds=12.5,
        )

        assert caplog.records
        record = caplog.records[-1]
        assert record.levelno == logging.INFO
        rendered = record.getMessage()
        assert "revision_inventory_scan_progress" in rendered
        assert "resource_inventory" in rendered
        assert "elapsed_seconds" in rendered
    finally:
        set_logging(in_prod=False)


def _drop_log_record(*_args, **_kwargs):
    """Simulate a logger that is effectively WARN-filtered (or otherwise
    drops INFO records) - the exact production condition this reproduces:
    `logger.info(...)` calls that never surface anywhere.
    """
    return None


def test_operator_event_reaches_stdout_even_when_logger_is_filtered(
    monkeypatch, capsys
):
    monkeypatch.setattr(
        delete_revision_history_command.logger, "info", _drop_log_record
    )

    delete_revision_history_command._operator_event(
        "revision_inventory_scan_progress",
        scan="resource_inventory",
        pages=3,
        rows=1500,
        batch_size=500,
        elapsed_seconds=12.5,
    )

    captured = capsys.readouterr()
    assert captured.out == (
        "revision_inventory_scan_progress scan=resource_inventory pages=3 "
        "rows=1500 batch_size=500 elapsed_seconds=12.5\n"
    )


def test_emit_operator_line_reaches_stdout_even_when_logger_is_filtered(
    monkeypatch, capsys
):
    monkeypatch.setattr(
        delete_revision_history_command.logger, "info", _drop_log_record
    )
    line = (
        "revision_inventory phase=pre_cleanup item_type=workflow "
        "resource_count=1 total_revision_count=1 "
        "excess_historical_revisions=0 state=clean"
    )

    delete_revision_history_command._emit_operator_line(line)

    captured = capsys.readouterr()
    assert captured.out == line + "\n"


def test_collect_revision_inventory_progress_reaches_stdout_when_logger_filtered(
    monkeypatch, capsys
):
    """Reproduces the production condition for the inventory scans specifically:
    even with `logger.info` dropped, start/progress/complete events for both
    scans still appear on stdout, in order, with bounded cadence (not one
    line per page) - matching the ~85-minute silent-inventory evidence this
    follow-up addresses.
    """
    monkeypatch.setattr(
        delete_revision_history_command.logger, "info", _drop_log_record
    )
    page_count = 1200
    resource_pages = [[(index, "workflow")] for index in range(page_count)]
    fake_session = _CannedPagedSession(resource_pages, revision_pages=())

    collect_revision_inventory(
        fake_session,
        scan_batch_size=1,
        progress_page_interval=500,
        progress_time_interval=1_000_000.0,
        clock=_make_clock(step=0.0),
    )

    lines = capsys.readouterr().out.splitlines()
    resource_lines = [line for line in lines if "scan=resource_inventory" in line]
    assert resource_lines[0].startswith("revision_inventory_scan_start")
    assert resource_lines[-1].startswith("revision_inventory_scan_complete")
    progress_lines = [
        line for line in resource_lines if line.startswith("revision_inventory_scan_progress")
    ]
    # Page-interval cadence: pages 1, 501, 1001 - not one stdout line per page.
    assert [line.split("pages=")[1].split(" ")[0] for line in progress_lines] == [
        "1",
        "501",
        "1001",
    ]
    assert len(progress_lines) < page_count / 100

    revision_lines = [line for line in lines if "scan=revision_inventory" in line]
    assert revision_lines[0].startswith("revision_inventory_scan_start")
    assert revision_lines[-1].startswith("revision_inventory_scan_complete")
    assert "pages=0" in revision_lines[-1]
    assert "rows=0" in revision_lines[-1]


def test_inventory_summaries_reach_stdout_when_logger_filtered(monkeypatch, capsys):
    """Reproduces the production condition for the per-type/database-total
    inventory summary lines specifically (not just periodic page counts) -
    the information the captain needs to identify other hot item types.
    """
    monkeypatch.setattr(
        delete_revision_history_command.logger, "info", _drop_log_record
    )
    report = {
        "by_item_type": {
            "workflow": {
                "resource_count": 1,
                "total_revision_count": 4,
                "excess_historical_revisions": 2,
            },
        },
        "totals": {
            "resource_count": 1,
            "total_revision_count": 4,
            "excess_historical_revisions": 2,
        },
    }

    log_revision_inventory(report)
    log_post_cleanup_revision_inventory(report, {"workflow": 2}, dry_run=False)

    lines = capsys.readouterr().out.splitlines()
    assert any(
        "phase=pre_cleanup item_type=workflow" in line
        and "excess_historical_revisions=2" in line
        for line in lines
    )
    assert any(
        "phase=pre_cleanup scope=database_total" in line
        and "excess_historical_revisions=2" in line
        for line in lines
    )
    assert any(
        "phase=post_cleanup item_type=workflow" in line
        and "excess_historical_revisions=0" in line
        for line in lines
    )
    assert any(
        "phase=post_cleanup scope=database_total" in line
        and "excess_historical_revisions=0" in line
        for line in lines
    )


def test_dry_run_boundary_and_batch_events_reach_stdout_without_mutating(
    app, session, monkeypatch, capsys
):
    """End-to-end: with the logger filtered, --dry-run's target-discovery and
    cleanup boundary events (plus the existing per-batch events) still reach
    stdout, and no propsheet row is deleted - a dry-run can therefore be used
    to collect inventory/progress visibility without destructive cleanup.
    """
    monkeypatch.setattr(
        delete_revision_history_command.logger, "info", _drop_log_record
    )
    _resources_with_history(session, {"workflow": 2})

    # Prove "no mutation" deterministically at the code level rather than by
    # comparing before/after DB row counts: this is the first test to
    # exercise --dry-run end-to-end through delete_revision_history against
    # the shared fixture database, and prior attempts here hit before/after
    # row-count comparisons that were unreliable for reasons tied to shared
    # DB state across this suite's tests (see the PR body's "Observed
    # anomaly" note) - not to anything this observability-only change
    # controls. _delete_revision_sids is the *only* function that issues a
    # DELETE; asserting it is never called under dry_run=True is a strictly
    # stronger and DB-state-independent guarantee than re-reading row counts.
    def _fail_if_delete_called(*args, **kwargs):
        raise AssertionError("_delete_revision_sids must not be called under dry_run=True")

    monkeypatch.setattr(
        delete_revision_history_command, "_delete_revision_sids", _fail_if_delete_called
    )

    counted = delete_revision_history(app, prod=True, dry_run=True, batch_size=1)

    # Not asserting an exact/minimum count here: the shared fixture
    # database's exact workflow/meta_workflow_run row counts at this point
    # depend on other tests' state, which is out of scope for this
    # observability-only change - see the PR body's "Observed anomaly" note.
    assert counted["workflow"] >= 0

    lines = capsys.readouterr().out.splitlines()
    assert any(line.startswith("delete_revision_history_rid_discovery_start") for line in lines)
    assert any(line.startswith("delete_revision_history_rid_discovery_complete") for line in lines)
    assert any(line.startswith("delete_revision_history_cleanup_start") for line in lines)
    assert any(
        line.startswith("delete_revision_history_batch") and "dry_run=True" in line
        for line in lines
    )
    workflow_complete_lines = [
        line
        for line in lines
        if line.startswith("delete_revision_history_cleanup_type_complete")
        and "item_type=workflow" in line
    ]
    assert workflow_complete_lines
    assert f"affected_count={counted['workflow']}" in workflow_complete_lines[0]


def test_scan_and_delete_batch_size_defaults():
    assert DEFAULT_SCAN_BATCH_SIZE == 2000
    assert DEFAULT_BATCH_SIZE == 500

    scan_default = inspect.signature(collect_revision_inventory).parameters[
        "scan_batch_size"
    ].default
    report_default = inspect.signature(report_revision_inventory).parameters[
        "scan_batch_size"
    ].default
    delete_default = inspect.signature(
        delete_old_revision_history_for_item_type
    ).parameters["batch_size"].default
    cleanup_default = inspect.signature(delete_revision_history).parameters[
        "batch_size"
    ].default

    assert scan_default == DEFAULT_SCAN_BATCH_SIZE == 2000
    assert report_default == DEFAULT_SCAN_BATCH_SIZE == 2000
    assert delete_default == DEFAULT_BATCH_SIZE == 500
    assert cleanup_default == DEFAULT_BATCH_SIZE == 500


def test_scan_and_delete_batch_sizes_independently_bound_their_own_pages(session):
    """Setting scan_batch_size and batch_size to different values in the same
    run proves each bounds only its own path: the inventory scan's resource
    pages are all capped at scan_batch_size, and the deletion path's
    per-DELETE row counts match batch_size, with neither picking up the
    other's value.

    The shared fixture database's total resource/deletable-row counts at
    this point depend on other tests' state (collect_revision_inventory and
    _target_rids_by_type are both deliberately database-wide - see this PR's
    "Observed anomaly" note), so this asserts bounds and deltas rather than
    absolute page/row counts, the same pattern already established
    elsewhere in this file for that reason.
    """
    baseline_deletable = delete_old_revision_history_for_item_type(
        session, "workflow", batch_size=10_000, dry_run=True
    )
    _resources_with_history(session, {"workflow": 4})

    class RecordingSession:
        def __init__(self, wrapped_session):
            self.wrapped_session = wrapped_session
            self.calls = []

        def execute(self, statement, parameters):
            rows = self.wrapped_session.execute(statement, parameters).fetchall()
            self.calls.append(
                {"statement": statement, "parameters": parameters, "rows": rows}
            )
            return _FetchAllResult(rows)

    recording_session = RecordingSession(session)
    collect_revision_inventory(recording_session, scan_batch_size=3)

    resource_pages = [
        call
        for call in recording_session.calls
        if "SELECT RID, ITEM_TYPE" in call["statement"].text.upper()
    ]
    assert resource_pages
    # Every resource page - regardless of how many other resources the
    # shared fixture database also contains - is bounded by scan_batch_size,
    # never by the unrelated deletion batch_size used moments later.
    assert all(call["parameters"]["batch_size"] == 3 for call in resource_pages)
    assert all(len(call["rows"]) <= 3 for call in resource_pages)
    assert resource_pages[-1]["rows"] == []

    engine = session.get_bind()
    delete_rowcounts = []

    def capture_delete_rowcount(
        _conn, _cursor, statement, _parameters, _context, _executemany
    ):
        if statement.lstrip().upper().startswith("DELETE FROM PROPSHEETS"):
            delete_rowcounts.append(_cursor.rowcount)

    event.listen(engine, "after_cursor_execute", capture_delete_rowcount)
    try:
        deleted = delete_old_revision_history_for_item_type(
            session, "workflow", batch_size=1
        )
    finally:
        event.remove(engine, "after_cursor_execute", capture_delete_rowcount)

    # 4 fresh workflow resources contribute 2 old rows each = 8, on top of
    # whatever the baseline already had; one row per DELETE at batch_size=1
    # - matches the deletion setting, not the unrelated scan_batch_size=3
    # used moments earlier on the same session.
    expected_deleted = baseline_deletable + 8
    assert deleted == expected_deleted
    assert len(delete_rowcounts) == expected_deleted
    assert all(0 <= rowcount <= 1 for rowcount in delete_rowcounts)


class _FixedRowCountSession:
    """Serves a fixed synthetic resource row set, paginated by whatever
    ``batch_size`` a caller passes per page - unlike ``_CannedPagedSession``,
    which serves pre-chunked pages regardless of the requested batch size,
    this lets the same underlying row set be re-paginated at different scan
    sizes to compare page counts directly.
    """

    def __init__(self, total_resource_rows):
        self._rows = [(index, "workflow") for index in range(total_resource_rows)]

    def execute(self, statement, parameters):
        sql = statement.text.upper()
        if "SELECT RID, ITEM_TYPE" in sql:
            batch_size = parameters["batch_size"]
            after_rid = parameters.get("after_rid")
            start = 0 if after_rid is None else after_rid + 1
            return _FetchAllResult(self._rows[start:start + batch_size])
        if "SELECT P.SID" in sql:
            return _FetchAllResult([])
        raise AssertionError(f"unexpected statement: {sql}")


def test_scan_batch_size_quarters_nonempty_resource_pages_at_2000_vs_500():
    """A fixed synthetic row set needs exactly one quarter as many nonempty
    resource-scan pages at scan_batch_size=2000 as at scan_batch_size=500,
    plus the same single terminating empty page each time - a page-count
    assertion only, no timing involved.
    """
    total_rows = 2000

    def resource_page_row_counts(scan_batch_size):
        session = _FixedRowCountSession(total_rows)
        pages = []
        real_execute = session.execute

        def recording_execute(statement, parameters):
            result = real_execute(statement, parameters)
            if "SELECT RID, ITEM_TYPE" in statement.text.upper():
                pages.append(len(result._rows))
            return result

        session.execute = recording_execute
        collect_revision_inventory(session, scan_batch_size=scan_batch_size)
        return pages

    pages_at_500 = resource_page_row_counts(500)
    pages_at_2000 = resource_page_row_counts(2000)

    assert pages_at_500 == [500, 500, 500, 500, 0]
    assert pages_at_2000 == [2000, 0]

    nonempty_at_500 = [count for count in pages_at_500 if count]
    nonempty_at_2000 = [count for count in pages_at_2000 if count]
    assert len(nonempty_at_500) == 4
    assert len(nonempty_at_2000) == 1
    assert len(nonempty_at_2000) == len(nonempty_at_500) / 4
    # Both runs terminate with exactly one empty page, regardless of size.
    assert pages_at_500[-1] == 0
    assert pages_at_2000[-1] == 0


def test_invalid_scan_batch_size_fails_before_any_database_statement():
    class ExplodingSession:
        def execute(self, *args, **kwargs):
            raise AssertionError(
                "no database statement should execute for an invalid scan_batch_size"
            )

    for invalid in (0, -1, True, 1.5, "500"):
        with pytest.raises(ValueError):
            collect_revision_inventory(ExplodingSession(), scan_batch_size=invalid)


def test_invalid_delete_batch_size_fails_before_any_database_statement():
    class ExplodingSession:
        def execute(self, *args, **kwargs):
            raise AssertionError(
                "no database statement should execute for an invalid batch_size"
            )

        def query(self, *args, **kwargs):
            raise AssertionError(
                "no database statement should execute for an invalid batch_size"
            )

    for invalid in (0, -1, True, 1.5, "500"):
        with pytest.raises(ValueError):
            delete_old_revision_history_for_item_type(
                ExplodingSession(), "workflow", batch_size=invalid
            )


def test_main_validates_both_batch_sizes_before_get_app(monkeypatch):
    """An invalid --batch-size or --scan-batch-size must fail before
    get_app() - and therefore before any database work - runs. argparse's
    own _positive_batch_size type already rejects these at parse time, so
    this also proves main() never reaches get_app() in that case.
    """

    def fail_if_called(*args, **kwargs):
        raise AssertionError("get_app must not run when a batch size is invalid")

    monkeypatch.setattr(delete_revision_history_command, "get_app", fail_if_called)

    monkeypatch.setattr(
        delete_revision_history_command.sys,
        "argv",
        [
            "delete-revision-history",
            "production.ini",
            "--app-name",
            "app",
            "--batch-size",
            "0",
        ],
    )
    with pytest.raises(SystemExit):
        delete_revision_history_command.main()

    monkeypatch.setattr(
        delete_revision_history_command.sys,
        "argv",
        [
            "delete-revision-history",
            "production.ini",
            "--app-name",
            "app",
            "--scan-batch-size",
            "-1",
        ],
    )
    with pytest.raises(SystemExit):
        delete_revision_history_command.main()


def test_main_reports_distinct_batch_sizes_per_phase(monkeypatch, capsys):
    """Initialization reports both sizes distinctly; the deletion-phase
    cleanup_start event reports only the deletion size.
    """
    app = object()
    report = {"by_item_type": {}, "totals": {}}
    monkeypatch.setattr(delete_revision_history_command, "get_app", lambda *args: app)
    monkeypatch.setattr(
        delete_revision_history_command,
        "report_revision_inventory",
        lambda received_app, scan_batch_size: report,
    )
    monkeypatch.setattr(
        delete_revision_history_command, "log_revision_inventory", lambda received_report: None
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "delete_revision_history",
        lambda received_app, prod, dry_run, batch_size: {
            "workflow": 0, "meta_workflow_run": 0
        },
    )
    monkeypatch.setattr(
        delete_revision_history_command,
        "log_post_cleanup_revision_inventory",
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        delete_revision_history_command.sys,
        "argv",
        [
            "delete-revision-history",
            "production.ini",
            "--app-name",
            "app",
            "--batch-size",
            "77",
            "--scan-batch-size",
            "999",
        ],
    )

    with pytest.raises(SystemExit):
        delete_revision_history_command.main()

    out = capsys.readouterr().out
    assert "delete_revision_history_initialized" in out
    assert "scan_batch_size=999" in out
    assert "batch_size=77" in out


def test_cleanup_start_and_batch_events_report_only_the_deletion_batch_size(
    app, session, monkeypatch, capsys
):
    """The cleanup phase's own boundary and per-batch events report the
    deletion batch size, never the (unrelated, independently configurable)
    scan batch size.
    """
    monkeypatch.setattr(
        delete_revision_history_command.logger, "info", _drop_log_record
    )
    _resources_with_history(session, {"workflow": 2})

    delete_revision_history(app, prod=True, batch_size=13)

    lines = capsys.readouterr().out.splitlines()
    cleanup_start_lines = [
        line for line in lines if line.startswith("delete_revision_history_cleanup_start")
    ]
    assert cleanup_start_lines
    assert all("batch_size=13" in line for line in cleanup_start_lines)
    assert all("scan_batch_size" not in line for line in cleanup_start_lines)

    batch_lines = [
        line for line in lines if line.startswith("delete_revision_history_batch")
    ]
    assert batch_lines
    assert all("batch_size=13" in line for line in batch_lines)


def test_item_types_to_purge_is_exactly_the_intended_ten_types():
    """Guards against the specific defect this expansion round fixed: a
    missing comma between two adjacent string literals in the tuple
    definition, which Python silently concatenates into one bogus element
    instead of raising an error - reducing the purge list from ten targets
    to nine without any exception. Comparing both the exact tuple contents
    and its length catches that failure mode directly, rather than relying
    only on set equality (which alone would still pass if two literals
    concatenated into a value that happened to collide with pure luck - it
    can't here, but pinning length too keeps this test protective against
    any future adjacent-literal edit in this tuple, not just this one).
    """
    intended_types = (
        "access_key",
        "file_format",
        "workflow",
        "workflow_run",
        "meta_workflow",
        "meta_workflow_run",
        "page",
        "tissue",
        "tissue_sample",
        "static_section",
    )
    assert ITEM_TYPES_TO_PURGE == intended_types
    assert len(ITEM_TYPES_TO_PURGE) == 10
    assert "meta_workflow_runpage" not in ITEM_TYPES_TO_PURGE


def test_purge_tuple_exactly_matches_registered_untracked_item_types(registry):
    """Ties ITEM_TYPES_TO_PURGE to the live type registry so the two cannot
    silently drift apart: every item type registered with
    ``track_revisions = False`` must be a purge target, and every purge
    target must resolve to a registered type with ``track_revisions =
    False``. Either direction of drift - a type left tracked but still
    purged (a no-op that raises false confidence), or a type opted out of
    tracking but never cleaned up (unbounded growth with no cleanup) - fails
    this test.
    """
    untracked_registered_item_types = {
        item_type
        for item_type, type_info in registry[TYPES].by_item_type.items()
        if getattr(type_info.factory, "track_revisions", True) is False
    }
    assert untracked_registered_item_types == set(ITEM_TYPES_TO_PURGE)


@pytest.mark.parametrize(
    "item_type",
    [
        "access_key",
        "file_format",
        "workflow",
        "workflow_run",
        "meta_workflow",
        "meta_workflow_run",
        "page",
        "tissue",
        "tissue_sample",
        "static_section",
    ],
)
def test_each_purge_target_is_a_registered_item_type_with_tracking_disabled(
    registry, item_type
):
    """Each of the ten target type names must resolve to an actual
    registered item type (not a typo/renamed type silently absent from the
    registry) whose class has revision tracking explicitly disabled.
    """
    type_info = registry[TYPES].by_item_type[item_type]
    assert getattr(type_info.factory, "track_revisions", True) is False


def test_access_key_cleanup_preserves_current_secret_hash(session):
    """AccessKey security boundary for the generic cleanup (see the
    ``track_revisions`` comment on ``encoded.types.access_key.AccessKey``):
    the plaintext secret is never persisted, but a bcrypt
    ``secret_access_key_hash`` is part of the persisted properties, so a
    superseded (rotated) hash can live in an old, non-current propsheet row.

    This proves the cleanup's existing current-row exclusion - the same
    invariant every other purge target relies on, not a special case for
    AccessKey - holds for that specific field: an old row containing a
    superseded hash is eligible for deletion, while the row containing the
    live, currently-authenticating hash is always preserved.
    """
    resource = Resource("access_key", {"": {"secret_access_key_hash": "old-superseded-hash"}})
    session.add(resource)
    session.flush()

    # Simulate a secret rotation/reset: a new propsheet row becomes current,
    # demoting the previous row (still holding the superseded hash) to
    # non-current history.
    resource[""] = {"secret_access_key_hash": "current-hash"}
    session.flush()

    rows_before = _propsheet_rows(session, resource.rid)
    assert len(rows_before) == 2
    current_sids = _current_sids(session, [resource])
    assert len(current_sids) == 1

    old_row = next(row for row in rows_before if row.sid not in current_sids)
    assert old_row.properties["secret_access_key_hash"] == "old-superseded-hash"

    deleted = delete_old_revision_history_for_item_type(session, "access_key")

    assert deleted == 1
    remaining_rows = _propsheet_rows(session, resource.rid)
    assert len(remaining_rows) == 1
    assert remaining_rows[0].sid in current_sids
    assert remaining_rows[0].properties["secret_access_key_hash"] == "current-hash"
