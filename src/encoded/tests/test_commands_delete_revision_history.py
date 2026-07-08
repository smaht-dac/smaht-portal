from snovault.storage import CurrentPropertySheet, PropertySheet, Resource

from encoded.commands.delete_revision_history import (
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
