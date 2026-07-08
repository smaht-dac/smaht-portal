import argparse
import logging
import sys
from typing import Dict, Optional

import structlog
import transaction
from dcicutils.env_utils import is_stg_or_prd_env
from pyramid.paster import get_app
from snovault import DBSESSION, configure_dbsession
from snovault.storage import CurrentPropertySheet, PropertySheet, Resource


logger = structlog.getLogger(__name__)

ITEM_TYPES_TO_PURGE = ("workflow", "meta_workflow_run")


def old_revision_history_for_item_type(session, item_type: str):
    """Query non-current propsheet rows belonging to one item type."""
    resource_of_type_exists = (
        session.query(Resource.rid)
        .filter(
            Resource.rid == PropertySheet.rid,
            Resource.item_type == item_type,
        )
        .exists()
    )
    current_propsheet_exists = (
        session.query(CurrentPropertySheet.sid)
        .filter(
            CurrentPropertySheet.rid == PropertySheet.rid,
            CurrentPropertySheet.name == PropertySheet.name,
            CurrentPropertySheet.sid == PropertySheet.sid,
        )
        .exists()
    )
    return session.query(PropertySheet).filter(
        resource_of_type_exists,
        ~current_propsheet_exists,
    )


def delete_old_revision_history_for_item_type(
    session, item_type: str, dry_run: bool = False
) -> int:
    """Delete all non-current propsheet rows for an item type."""
    old_revisions = old_revision_history_for_item_type(session, item_type)
    if dry_run:
        return old_revisions.count()
    return old_revisions.delete(synchronize_session=False)


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
    deleted_by_type = {}

    try:
        for item_type in ITEM_TYPES_TO_PURGE:
            deleted_by_type[item_type] = delete_old_revision_history_for_item_type(
                session, item_type, dry_run=dry_run
            )
        if not dry_run:
            transaction.commit()
    except Exception as e:
        logger.error("Encountered exception deleting revision history: %s", e)
        transaction.abort()
        raise

    return deleted_by_type


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
