import argparse
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import event, text
from snovault import DBSESSION
from snovault.storage import CurrentPropertySheet, PropertySheet, Resource

import encoded.commands.delete_revision_history as delete_revision_history_command
from encoded.commands.delete_revision_history import (
    DEFAULT_BATCH_SIZE,
    _positive_batch_size,
    _validate_batch_size,
    collect_revision_inventory,
    delete_revision_history,
    delete_old_revision_history_for_item_type,
    log_post_cleanup_revision_inventory,
    log_revision_inventory,
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

    report = collect_revision_inventory(session, batch_size=1)

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
    report = collect_revision_inventory(recording_session, batch_size=1)

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

    def assert_bounded_keyset_pages(calls, key_parameter, order_clause, row_index):
        assert calls
        assert calls[-1]["rows"] == []
        nonempty_calls = calls[:-1]
        assert nonempty_calls
        assert key_parameter not in nonempty_calls[0]["parameters"]
        assert calls[-1]["parameters"][key_parameter] == nonempty_calls[-1]["rows"][-1][
            row_index
        ]

        for index, call in enumerate(calls):
            sql = call["statement"].text.upper()
            assert "SELECT *" not in sql
            assert "LIMIT" in sql
            assert order_clause in sql
            assert "COUNT(" not in sql
            if index and index < len(nonempty_calls):
                previous_call = nonempty_calls[index - 1]
                assert call["parameters"][key_parameter] == previous_call["rows"][-1][
                    row_index
                ]
                assert str(call["rows"][0][row_index]) > str(
                    previous_call["rows"][-1][row_index]
                )

    assert_bounded_keyset_pages(
        resource_batches, "after_rid", "ORDER BY RID", row_index=0
    )
    assert_bounded_keyset_pages(
        revision_batches, "after_sid", "ORDER BY P.SID", row_index=0
    )
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
        lambda session: {"workflow": [], "meta_workflow_run": []},
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
        "workflow": 0,
        "meta_workflow_run": 0,
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

    assert resumed == {"workflow": 4, "meta_workflow_run": 4}
    assert completed == {"workflow": 0, "meta_workflow_run": 0}
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
        lambda received_app, batch_size: calls.append(
            ("report", received_app, batch_size)
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
        ],
    )

    with pytest.raises(SystemExit) as exit_info:
        delete_revision_history_command.main()

    assert exit_info.value.code == 0
    assert calls == [
        ("report", app, 2),
        ("pre_log", report),
        ("cleanup", app, True, True, 2),
        ("post_log", report, {"workflow": 0, "meta_workflow_run": 0}, True),
    ]
