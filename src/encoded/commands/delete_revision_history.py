import argparse
import logging
import sys
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import structlog
import transaction
from dcicutils.env_utils import is_stg_or_prd_env
from pyramid.paster import get_app
from snovault import DBSESSION, configure_dbsession
from snovault.storage import CurrentPropertySheet, PropertySheet, Resource


logger = structlog.getLogger(__name__)

ITEM_TYPES_TO_PURGE = ("workflow", "meta_workflow_run")
DEFAULT_BATCH_SIZE = 500


def _positive_batch_size(value: str) -> int:
    try:
        batch_size = int(value)
    except (TypeError, ValueError):
        raise argparse.ArgumentTypeError("batch size must be a positive integer")
    if batch_size < 1:
        raise argparse.ArgumentTypeError("batch size must be a positive integer")
    return batch_size


def _validate_batch_size(batch_size: int) -> int:
    if isinstance(batch_size, bool) or not isinstance(batch_size, int) or batch_size < 1:
        raise ValueError("batch size must be a positive integer")
    return batch_size


def _chunks(values: Sequence, chunk_size: int) -> Iterable[Sequence]:
    for start in range(0, len(values), chunk_size):
        yield values[start : start + chunk_size]


def _target_rids_by_type(session) -> Dict[str, List]:
    """Read the target resource ids once, before deleting any propsheets."""
    rids_by_type = {item_type: [] for item_type in ITEM_TYPES_TO_PURGE}
    target_resources = (
        session.query(Resource.rid, Resource.item_type)
        .filter(Resource.item_type.in_(ITEM_TYPES_TO_PURGE))
        .order_by(Resource.item_type, Resource.rid)
        .all()
    )
    for rid, item_type in target_resources:
        rids_by_type[item_type].append(rid)
    return rids_by_type


def old_revision_history_for_item_type(
    session,
    item_type: str,
    rids: Optional[Sequence] = None,
    after_sid: Optional[int] = None,
    batch_size: Optional[int] = None,
):
    """Query a bounded page of non-current propsheet rows for an item type."""
    if rids is None:
        resource_of_type_exists = (
            session.query(Resource.rid)
            .filter(
                Resource.rid == PropertySheet.rid,
                Resource.item_type == item_type,
            )
            .exists()
        )
    else:
        resource_of_type_exists = PropertySheet.rid.in_(rids)
    current_propsheet_exists = (
        session.query(CurrentPropertySheet.sid)
        .filter(
            CurrentPropertySheet.rid == PropertySheet.rid,
            CurrentPropertySheet.name == PropertySheet.name,
            CurrentPropertySheet.sid == PropertySheet.sid,
        )
        .exists()
    )
    query = session.query(PropertySheet).filter(
        resource_of_type_exists,
        ~current_propsheet_exists,
    )
    if after_sid is not None:
        query = query.filter(PropertySheet.sid > after_sid)
    if batch_size is not None:
        query = query.order_by(PropertySheet.sid).limit(
            _validate_batch_size(batch_size)
        )
    return query


def _old_revision_sids(
    session,
    item_type: str,
    rids: Sequence,
    batch_size: int,
    after_sid: Optional[int] = None,
) -> List[int]:
    query = old_revision_history_for_item_type(
        session,
        item_type,
        rids=rids,
        after_sid=after_sid,
        batch_size=batch_size,
    )
    return [sid for (sid,) in query.with_entities(PropertySheet.sid).all()]


def _delete_revision_sids(session, item_type: str, rids: Sequence, sids: Sequence) -> int:
    """Delete a selected, bounded page while rechecking current-row protection."""
    old_revisions = old_revision_history_for_item_type(
        session,
        item_type,
        rids=rids,
    ).filter(PropertySheet.sid.in_(sids))
    return old_revisions.delete(synchronize_session=False)


def _process_rid_chunk(
    session,
    item_type: str,
    rid_chunk: Sequence,
    batch_size: int,
    dry_run: bool,
    commit_each_batch: bool,
    batch_number: int,
    processed_count: int,
) -> Tuple[int, int, int]:
    """Process one rid chunk until no old revision remains in it."""
    total = 0
    pass_number = 0
    while True:
        pass_number += 1
        pass_total = 0
        last_sid = None
        while True:
            sids = _old_revision_sids(
                session,
                item_type,
                rid_chunk,
                batch_size,
                after_sid=last_sid,
            )
            if not sids:
                break

            batch_number += 1
            last_sid = sids[-1]
            if dry_run:
                affected_count = len(sids)
            else:
                affected_count = _delete_revision_sids(
                    session, item_type, rid_chunk, sids
                )
                pass_total += affected_count

            total += affected_count
            processed_count += affected_count
            logger.info(
                "delete_revision_history_batch",
                item_type=item_type,
                dry_run=dry_run,
                batch=batch_number,
                pass_number=pass_number,
                rid_count=len(rid_chunk),
                selected_count=len(sids),
                affected_count=affected_count,
                processed_count=processed_count,
            )
            if commit_each_batch:
                transaction.commit()

        if dry_run or pass_total == 0:
            break

    return total, batch_number, processed_count


def delete_old_revision_history_for_item_type(
    session,
    item_type: str,
    dry_run: bool = False,
    batch_size: int = DEFAULT_BATCH_SIZE,
    rids: Optional[Sequence] = None,
    commit_each_batch: bool = False,
) -> int:
    """Delete or count all non-current propsheet rows for an item type in batches."""
    batch_size = _validate_batch_size(batch_size)
    if rids is None:
        rids = _target_rids_by_type(session).get(item_type, [])

    total = 0
    batch_number = 0
    processed_count = 0
    for rid_chunk in _chunks(rids, batch_size):
        chunk_total, batch_number, processed_count = _process_rid_chunk(
            session,
            item_type,
            rid_chunk,
            batch_size,
            dry_run,
            commit_each_batch,
            batch_number,
            processed_count,
        )
        total += chunk_total
    return total


def delete_revision_history(
    app,
    prod: bool = False,
    dry_run: bool = False,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> Optional[Dict[str, int]]:
    """
    Remove already-stored Postgres revision history for Workflow and MetaWorkflowRun.

    Current propsheet rows are preserved. Only old PropertySheet rows not pointed
    at by CurrentPropertySheet for the same (rid, name) are deleted.
    """
    batch_size = _validate_batch_size(batch_size)

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
        rids_by_type = _target_rids_by_type(session)
        for item_type in ITEM_TYPES_TO_PURGE:
            deleted_by_type[item_type] = delete_old_revision_history_for_item_type(
                session,
                item_type,
                dry_run=dry_run,
                batch_size=batch_size,
                rids=rids_by_type[item_type],
                commit_each_batch=True,
            )
        transaction.commit()
    except Exception as e:
        logger.error("Encountered exception deleting revision history: %s", e)
        transaction.abort()
        raise

    return deleted_by_type


def main() -> None:
    logging.basicConfig(level=logging.INFO)

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
    parser.add_argument(
        "--batch-size",
        help="Maximum number of old revision rows selected per batch",
        type=_positive_batch_size,
        default=DEFAULT_BATCH_SIZE,
    )
    args = parser.parse_args()

    app = get_app(args.config_uri, args.app_name)
    deleted_by_type = delete_revision_history(
        app,
        prod=args.prod,
        dry_run=args.dry_run,
        batch_size=args.batch_size,
    )
    for item_type in ITEM_TYPES_TO_PURGE:
        action = "would delete" if args.dry_run else "deleted"
        count = 0 if deleted_by_type is None else deleted_by_type.get(item_type, 0)
        print(f"{item_type}: {action} {count} old revision rows")
    sys.exit(1 if deleted_by_type is None else 0)


if __name__ == "__main__":
    main()
