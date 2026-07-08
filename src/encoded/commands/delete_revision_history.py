import argparse
import logging
import sys
from collections import defaultdict
from typing import Dict, Iterable, Optional

import structlog
import transaction
from dcicutils.env_utils import is_stg_or_prd_env
from pyramid.paster import get_app
from snovault import DBSESSION, configure_dbsession
from snovault.elasticsearch.indexer_utils import get_uuids_for_types
from snovault.storage import CurrentPropertySheet, PropertySheet


logger = structlog.getLogger(__name__)

ITEM_TYPES_TO_PURGE = ("workflow", "meta_workflow_run")


def _old_revision_sids_for_rid(session, rid: str) -> Iterable[int]:
    """Return propsheet sids for non-current revisions of a single resource."""
    current_sids_by_name = {
        name: sid
        for name, sid in (
            session.query(CurrentPropertySheet.name, CurrentPropertySheet.sid)
            .filter(CurrentPropertySheet.rid == rid)
            .all()
        )
    }
    propsheets = (
        session.query(PropertySheet.sid, PropertySheet.name)
        .filter(PropertySheet.rid == rid)
        .all()
    )
    return [
        sid
        for sid, name in propsheets
        if current_sids_by_name.get(name) != sid
    ]


def delete_old_revision_history_for_rid(session, rid: str, dry_run: bool = False) -> int:
    """Delete non-current propsheet rows for a resource and return the row count."""
    old_sids = list(_old_revision_sids_for_rid(session, rid))
    if old_sids and not dry_run:
        (
            session.query(PropertySheet)
            .filter(PropertySheet.sid.in_(old_sids))
            .delete(synchronize_session=False)
        )
    return len(old_sids)


def delete_revision_history(
    app, prod: bool = False, dry_run: bool = False
) -> Optional[Dict[str, int]]:
    """
    Remove already-stored Postgres revision history for Workflow and MetaWorkflowRun.

    Current propsheet rows are preserved. Only old PropertySheet rows not pointed
    at by CurrentPropertySheet for the same (rid, name) are deleted.
    """
    if not hasattr(app, "registry"):
        app = app.app
        if not hasattr(app, "registry"):
            raise RuntimeError("Passed app does not contain a registry.")

    if "env.name" in app.registry.settings:
        env = app.registry.settings["env.name"]
        if is_stg_or_prd_env(env) and not prod:
            logger.error(
                "Tried to run delete_revision_history on prod without specifying "
                "the prod option - exiting."
            )
            return None

    configure_dbsession(app)
    session = app.registry[DBSESSION]
    deleted_by_type = defaultdict(int)

    for item_type in ITEM_TYPES_TO_PURGE:
        for rid in get_uuids_for_types(app.registry, [item_type]):
            try:
                deleted_by_type[item_type] += delete_old_revision_history_for_rid(
                    session, rid, dry_run=dry_run
                )
                if not dry_run:
                    transaction.commit()
            except Exception as e:
                logger.error(
                    "Encountered exception deleting revision history for %s %s: %s",
                    item_type,
                    rid,
                    e,
                )
                transaction.abort()
                raise

    return {item_type: deleted_by_type[item_type] for item_type in ITEM_TYPES_TO_PURGE}


def main() -> None:
    logging.basicConfig()

    parser = argparse.ArgumentParser(
        description="Delete old Postgres revision-history rows for workflow item types."
    )
    parser.add_argument("config_uri", help="path to configfile")
    parser.add_argument("--app-name", help="Pyramid app name in configfile")
    parser.add_argument(
        "--prod",
        help="Whether or not to proceed if we are on a production server",
        action="store_true",
        default=False,
    )
    parser.add_argument(
        "--dry-run",
        help="Report old revision row counts without deleting them",
        action="store_true",
        default=False,
    )
    args = parser.parse_args()

    app = get_app(args.config_uri, args.app_name)
    deleted_by_type = delete_revision_history(
        app, prod=args.prod, dry_run=args.dry_run
    )
    for item_type in ITEM_TYPES_TO_PURGE:
        action = "would delete" if args.dry_run else "deleted"
        count = 0 if deleted_by_type is None else deleted_by_type.get(item_type, 0)
        print(f"{item_type}: {action} {count} old revision rows")
    sys.exit(1 if deleted_by_type is None else 0)


if __name__ == "__main__":
    main()
