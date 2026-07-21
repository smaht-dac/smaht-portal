import argparse
from pathlib import Path

import pytest
from sqlalchemy import event, text
from snovault.storage import CurrentPropertySheet, PropertySheet, Resource

import encoded.commands.delete_revision_history as delete_revision_history_command
from encoded.commands.delete_revision_history import (
    DEFAULT_BATCH_SIZE,
    _positive_batch_size,
    _validate_batch_size,
    delete_revision_history,
    delete_old_revision_history_for_item_type,
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


def test_interrupted_cleanup_resumes_idempotently(app, session, monkeypatch):
    resources = _resources_with_history(
        session, {"workflow": 3, "meta_workflow_run": 2}
    )
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
        len(_propsheet_rows(session, resource.rid)) == 2 for resource in resources
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
