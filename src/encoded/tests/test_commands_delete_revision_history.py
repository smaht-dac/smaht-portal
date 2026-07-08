from snovault.storage import CurrentPropertySheet, PropertySheet, Resource

from encoded.commands.delete_revision_history import (
    delete_old_revision_history_for_rid,
)


def _propsheet_rows(session, rid):
    return (
        session.query(PropertySheet)
        .filter(PropertySheet.rid == rid)
        .order_by(PropertySheet.sid)
        .all()
    )


def test_delete_old_revision_history_for_rid_preserves_current_propsheets(session):
    resource = Resource("workflow", {"": {"title": "initial"}, "extra": {"value": 1}})
    session.add(resource)
    session.flush()
    rid = resource.rid

    resource[""] = {"title": "current"}
    resource["extra"] = {"value": 2}
    session.flush()

    assert len(_propsheet_rows(session, rid)) == 4
    current_sids = {
        sid
        for (sid,) in (
            session.query(CurrentPropertySheet.sid)
            .filter(CurrentPropertySheet.rid == rid)
            .all()
        )
    }

    dry_run_count = delete_old_revision_history_for_rid(session, rid, dry_run=True)
    assert dry_run_count == 2
    assert len(_propsheet_rows(session, rid)) == 4

    deleted_count = delete_old_revision_history_for_rid(session, rid)
    assert deleted_count == 2
    remaining_sids = {row.sid for row in _propsheet_rows(session, rid)}
    assert remaining_sids == current_sids
