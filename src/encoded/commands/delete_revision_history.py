import argparse
from collections import Counter
import logging
import sys
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from sqlalchemy import text
import structlog
import transaction
from dcicutils.env_utils import is_stg_or_prd_env
from pyramid.paster import get_app
from snovault import DBSESSION, configure_dbsession
from snovault.storage import CurrentPropertySheet, PropertySheet, Resource


logger = structlog.getLogger(__name__)

ITEM_TYPES_TO_PURGE = ("workflow", "meta_workflow_run")
DEFAULT_BATCH_SIZE = 500

_RESOURCE_BATCH_FIRST = text(
    """
    SELECT rid, item_type
      FROM resources
     ORDER BY rid
     LIMIT :batch_size
    """
)
_RESOURCE_BATCH_AFTER = text(
    """
    SELECT rid, item_type
      FROM resources
     WHERE rid > :after_rid
     ORDER BY rid
     LIMIT :batch_size
    """
)
_REVISION_BATCH_FIRST = text(
    """
    SELECT p.sid, r.item_type, c.sid
      FROM propsheets AS p
      JOIN resources AS r ON r.rid = p.rid
      LEFT JOIN current_propsheets AS c
        ON c.rid = p.rid AND c.name = p.name AND c.sid = p.sid
     ORDER BY p.sid
     LIMIT :batch_size
    """
)
_REVISION_BATCH_AFTER = text(
    """
    SELECT p.sid, r.item_type, c.sid
      FROM propsheets AS p
      JOIN resources AS r ON r.rid = p.rid
      LEFT JOIN current_propsheets AS c
        ON c.rid = p.rid AND c.name = p.name AND c.sid = p.sid
     WHERE p.sid > :after_sid
     ORDER BY p.sid
     LIMIT :batch_size
    """
)


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


def _empty_inventory_row() -> Dict[str, int]:
    return {
        "resource_count": 0,
        "total_revision_count": 0,
        "excess_historical_revisions": 0,
    }


def _inventory_state(row: Dict[str, int]) -> str:
    if row["total_revision_count"] == 0:
        return "no_revisions"
    if row["excess_historical_revisions"] == 0:
        return "clean"
    return "historical_buildup"


def collect_revision_inventory(
    session, batch_size: int = DEFAULT_BATCH_SIZE
) -> Dict[str, Dict]:
    """Collect a bounded, read-only revision inventory for every item type.

    Resource identifiers and propsheet rows are each read in independent,
    keyset-ordered pages. The resource pages use the resources primary key;
    revision pages use the propsheets primary key and indexed joins on rid and
    (rid, name). No ORM objects or unbounded result sets are created, and
    totals are accumulated in Python across the bounded pages.
    """
    batch_size = _validate_batch_size(batch_size)
    by_item_type: Dict[str, Dict[str, int]] = {}
    totals = _empty_inventory_row()
    after_rid = None
    while True:
        if after_rid is None:
            resource_batch = _RESOURCE_BATCH_FIRST
            parameters = {"batch_size": batch_size}
        else:
            resource_batch = _RESOURCE_BATCH_AFTER
            parameters = {"after_rid": after_rid, "batch_size": batch_size}

        resource_rows = session.execute(resource_batch, parameters).fetchall()
        if not resource_rows:
            break

        resource_counts = Counter(item_type for _rid, item_type in resource_rows)
        for item_type, resource_count in resource_counts.items():
            row = by_item_type.setdefault(item_type, _empty_inventory_row())
            row["resource_count"] += resource_count

        totals["resource_count"] += len(resource_rows)
        after_rid = resource_rows[-1][0]

    after_sid = None
    while True:
        if after_sid is None:
            revision_batch = _REVISION_BATCH_FIRST
            parameters = {"batch_size": batch_size}
        else:
            revision_batch = _REVISION_BATCH_AFTER
            parameters = {"after_sid": after_sid, "batch_size": batch_size}

        revision_rows = session.execute(revision_batch, parameters).fetchall()
        if not revision_rows:
            break

        for sid, item_type, current_sid in revision_rows:
            row = by_item_type.setdefault(item_type, _empty_inventory_row())
            row["total_revision_count"] += 1
            if current_sid is None:
                row["excess_historical_revisions"] += 1
            totals["total_revision_count"] += 1
            if current_sid is None:
                totals["excess_historical_revisions"] += 1

        after_sid = revision_rows[-1][0]

    return {
        "by_item_type": dict(sorted(by_item_type.items())),
        "totals": totals,
    }


def _format_inventory_line(
    phase: str, scope: str, row: Dict[str, int]
) -> str:
    return (
        f"revision_inventory phase={phase} {scope} "
        f"resource_count={row['resource_count']} "
        f"total_revision_count={row['total_revision_count']} "
        f"excess_historical_revisions={row['excess_historical_revisions']} "
        f"state={_inventory_state(row)}"
    )


def format_revision_inventory_report(
    report: Dict[str, Dict], phase: str = "pre_cleanup"
) -> Tuple[str, ...]:
    """Return deterministic per-type and database-total inventory lines."""
    lines = [
        _format_inventory_line(phase, f"item_type={item_type}", row)
        for item_type, row in report["by_item_type"].items()
    ]
    lines.append(_format_inventory_line(phase, "scope=database_total", report["totals"]))
    return tuple(lines)


def log_revision_inventory(report: Dict[str, Dict], phase: str = "pre_cleanup") -> None:
    for line in format_revision_inventory_report(report, phase=phase):
        logger.info(line)


def log_post_cleanup_revision_inventory(
    report: Dict[str, Dict], deleted_by_type: Dict[str, int], dry_run: bool
) -> None:
    """Log target-type post-cleanup effects without a second inventory scan."""
    phase = "projected_post_cleanup" if dry_run else "post_cleanup"
    removed_total = 0
    for item_type in ITEM_TYPES_TO_PURGE:
        row = report["by_item_type"].get(item_type)
        if row is None:
            continue
        removed = deleted_by_type.get(item_type, 0)
        removed_total += removed
        post_row = dict(row)
        post_row["total_revision_count"] -= removed
        post_row["excess_historical_revisions"] -= removed
        logger.info(
            _format_inventory_line(phase, f"item_type={item_type}", post_row)
        )

    post_totals = dict(report["totals"])
    post_totals["total_revision_count"] -= removed_total
    post_totals["excess_historical_revisions"] -= removed_total
    logger.info(_format_inventory_line(phase, "scope=database_total", post_totals))


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


def _get_app(app):
    if not hasattr(app, "registry"):
        app = app.app
        if not hasattr(app, "registry"):
            raise RuntimeError("Passed app does not contain a registry.")
    return app


def _get_app_and_session(app):
    app = _get_app(app)

    # Test applications already register their fixture-backed DB session while
    # retaining the placeholder sqlalchemy.url setting. Reconfiguring such an
    # app would try to parse that placeholder instead of reusing the session.
    if DBSESSION not in app.registry or app.registry[DBSESSION] is None:
        configure_dbsession(app)
    return app, app.registry[DBSESSION]


def report_revision_inventory(app, batch_size: int = DEFAULT_BATCH_SIZE) -> Dict[str, Dict]:
    """Collect the deployment-wide inventory using the application's DB session."""
    _app, session = _get_app_and_session(app)
    return collect_revision_inventory(session, batch_size=batch_size)


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
    app = _get_app(app)

    if "env.name" in app.registry.settings:
        env = app.registry.settings["env.name"]
        if is_stg_or_prd_env(env) and not prod:
            logger.error(
                "Tried to run delete_revision_history on prod without specifying "
                "the prod option - exiting."
            )
            return None

    app, session = _get_app_and_session(app)
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
    inventory = report_revision_inventory(app, batch_size=args.batch_size)
    log_revision_inventory(inventory)
    deleted_by_type = delete_revision_history(
        app,
        prod=args.prod,
        dry_run=args.dry_run,
        batch_size=args.batch_size,
    )
    if deleted_by_type is not None:
        log_post_cleanup_revision_inventory(
            inventory, deleted_by_type, dry_run=args.dry_run
        )
    for item_type in ITEM_TYPES_TO_PURGE:
        action = "would delete" if args.dry_run else "deleted"
        count = 0 if deleted_by_type is None else deleted_by_type.get(item_type, 0)
        print(f"{item_type}: {action} {count} old revision rows")
    sys.exit(1 if deleted_by_type is None else 0)


if __name__ == "__main__":
    main()
