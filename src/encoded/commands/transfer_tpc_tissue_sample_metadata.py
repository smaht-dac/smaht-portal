#!/usr/bin/env python3
"""Transfer preservation_type, description, and processing_notes from TPC-submitted
tissue_sample items to non-TPC tissue_sample items sharing the same external_id.

Rules:
  - preservation_type: copied from TPC only if the target item lacks it
  - description / processing_notes: if both sides have a value they are merged as
    "GCC: <existing value>; TPC: <tpc value>"; if only TPC has a value it is used as-is
  - TPC items are never modified
  - Non-TPC items with no matching TPC external_id are skipped
"""

import argparse
import logging
from typing import Optional

from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager
from tqdm import tqdm
from tqdm.contrib.logging import logging_redirect_tqdm

NDRI_TPC_DISPLAY_TITLE = "NDRI TPC"
PROCESSED_TAG = "tpc_metadata_synced"

log = logging.getLogger(__name__)


def get_auth_key(env: str) -> dict:
    return SMaHTKeyManager().get_keydict_for_env(env)


def get_non_tpc_tissue_samples(auth_key: dict) -> list:
    query = (
        "/search/?type=TissueSample"
        f"&submission_centers.display_title!={NDRI_TPC_DISPLAY_TITLE.replace(' ', '+')}"
        f"&tags!={PROCESSED_TAG}"
        "&status!=deleted"
    )
    return ff_utils.search_metadata(query, key=auth_key, page_limit="all")


def get_tpc_sample_for_external_id(external_id: str, auth_key: dict) -> Optional[dict]:
    query = (
        "/search/?type=TissueSample"
        f"&external_id={external_id}"
        f"&submission_centers.display_title={NDRI_TPC_DISPLAY_TITLE.replace(' ', '+')}"
        "&status!=deleted"
    )
    results = ff_utils.search_metadata(query, key=auth_key)
    if not results:
        return None
    if len(results) > 1:
        log.warning(
            "Multiple TPC samples found for external_id %s — using first", external_id
        )
    return results[0]


def build_patch(tpc_sample: dict, target_sample: dict) -> Optional[dict]:
    patch = {}

    tpc_preservation = tpc_sample.get("preservation_type")
    target_preservation = target_sample.get("preservation_type")
    if tpc_preservation and not target_preservation:
        patch["preservation_type"] = tpc_preservation

    for field in ("description", "processing_notes"):
        tpc_val = tpc_sample.get(field)
        target_val = target_sample.get(field)
        if tpc_val and target_val:
            patch[field] = f"GCC: {target_val}; TPC: {tpc_val}"
        elif tpc_val:
            patch[field] = f"TPC: {tpc_val}"

    return patch if patch else None


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Transfer preservation_type, description, and processing_notes "
            "from TPC tissue samples to non-TPC tissue samples with a matching external_id."
        )
    )
    parser.add_argument(
        "--env",
        required=True,
        help="Portal environment key (e.g. data, staging, devtest)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        default=False,
        help="Execute patches against the portal (default: dry run only)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Log each sample outcome including skips",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
        force=True,
    )

    if not args.execute:
        log.info("DRY RUN — no changes will be made (pass --execute to apply patches)")

    auth_key = get_auth_key(args.env)
    log.info("Environment: %s (%s)", args.env, auth_key.get("server", "unknown"))

    log.info("Verifying connection...")
    try:
        ff_utils.search_metadata("/search/?type=TissueSample&limit=1", key=auth_key)
        log.info("Connected successfully")
    except Exception as exc:
        log.error("Could not connect to %s: %s", auth_key.get("server"), exc)
        return

    log.info("Fetching non-TPC tissue samples...")
    non_tpc_samples = get_non_tpc_tissue_samples(auth_key)
    log.info("Found %d non-TPC tissue samples", len(non_tpc_samples))

    patched = 0
    skipped_no_tpc = 0
    skipped_no_changes = 0
    errors = 0

    with logging_redirect_tqdm():
        for sample in tqdm(non_tpc_samples, desc="Processing samples", unit="sample"):
            external_id = sample.get("external_id")
            uuid = sample.get("uuid")

            if not external_id:
                log.debug("Sample %s has no external_id — skipping", uuid)
                skipped_no_tpc += 1
                continue

            log.debug("Looking up TPC sample for external_id %s", external_id)
            tpc_sample = get_tpc_sample_for_external_id(external_id, auth_key)
            if not tpc_sample:
                log.debug(
                    "No TPC sample for external_id %s (uuid: %s) — skipping",
                    external_id,
                    uuid,
                )
                skipped_no_tpc += 1
                continue

            patch = build_patch(tpc_sample, sample) or {}

            existing_tags = sample.get("tags", [])
            if PROCESSED_TAG not in existing_tags:
                patch["tags"] = existing_tags + [PROCESSED_TAG]

            if not patch:
                log.debug(
                    "Already processed %s (external_id: %s)", uuid, external_id
                )
                skipped_no_changes += 1
                continue

            if not args.execute:
                log.info(
                    "[DRY RUN] Would patch %s (external_id: %s): %s",
                    uuid,
                    external_id,
                    patch,
                )
                patched += 1
            else:
                try:
                    ff_utils.patch_metadata(patch, obj_id=uuid, key=auth_key)
                    log.info(
                        "Patched %s (external_id: %s): %s",
                        uuid,
                        external_id,
                        list(patch.keys()),
                    )
                    patched += 1
                except Exception as exc:
                    log.error("Failed to patch %s: %s", uuid, exc)
                    errors += 1

    action = "Patched" if args.execute else "Would patch"
    log.info(
        "Done. %s: %d | Skipped (no TPC match): %d | Skipped (already processed): %d | Errors: %d",
        action,
        patched,
        skipped_no_tpc,
        skipped_no_changes,
        errors,
    )


if __name__ == "__main__":
    main()
