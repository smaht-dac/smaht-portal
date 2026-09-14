#!/usr/bin/env python3
"""Transfer core_size, preservation_type, description, and processing_notes from
TPC-submitted tissue_sample items to non-TPC tissue_sample items sharing the same
external_id.

Rules:
  - core_size: copied from TPC only if the target item lacks it; mismatch → warn + skip
  - preservation_type: copied from TPC only if the target item lacks it
  - description / processing_notes: prefixed format "GCC: <gcc>; TPC: <tpc>" is parsed
    and made idempotent; GCC portion is preserved, TPC portion is replaced if changed
  - TPC items are never modified
  - Non-TPC items with no matching TPC external_id are skipped
  - By default, only non-TPC samples lacking the tpc_metadata_synced tag are selected
  - Use --ignore-tag to include already-tagged samples
  - Use --skip-tagging to suppress automatic tag addition
"""

import argparse
import logging
import re
from typing import Optional

from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager
from tqdm import tqdm
from tqdm.contrib.logging import logging_redirect_tqdm

NDRI_TPC_DISPLAY_TITLE = "NDRI TPC"
PROCESSED_TAG = "tpc_metadata_synced"

# Regex patterns for parsing prefixed values
GCC_TPC_PATTERN = re.compile(r"^GCC:\s*(.+?);\s*TPC:\s*(.+)$", re.DOTALL)
TPC_ONLY_PATTERN = re.compile(r"^TPC:\s*(.+)$", re.DOTALL)

log = logging.getLogger(__name__)


def get_auth_key(env: str) -> dict:
    return SMaHTKeyManager().get_keydict_for_env(env)


def get_non_tpc_tissue_samples(auth_key: dict, ignore_tag: bool = False) -> list:
    """Fetch non-TPC tissue samples, optionally filtering by tag presence."""
    query_parts = [
        "/search/?type=TissueSample",
        f"submission_centers.display_title!={NDRI_TPC_DISPLAY_TITLE.replace(' ', '+')}",
        "status!=deleted",
    ]
    if not ignore_tag:
        query_parts.append(f"tags!={PROCESSED_TAG}")
    query = "&".join(query_parts)
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


def parse_prefixed_value(value: str) -> Optional[tuple[Optional[str], Optional[str]]]:
    """Parse a prefixed value into (gcc_part, tpc_part).
    
    Returns None if the value is malformed.
    Returns (None, tpc_value) for "TPC: <value>" format.
    Returns (gcc_value, tpc_value) for "GCC: <gcc>; TPC: <tpc>" format.
    """
    if not value:
        return ("", None)
    
    # Check if it contains both GCC: and TPC: keywords
    gcc_count = value.count("GCC:")
    tpc_count = value.count("TPC:")
    
    if gcc_count > 0 and tpc_count > 0:
        # Must match the full GCC: ... ; TPC: ... pattern
        match = GCC_TPC_PATTERN.match(value)
        if match:
            return (match.group(1).strip(), match.group(2).strip())
        else:
            # Has both keywords but doesn't match pattern - malformed
            return None
    
    # Try TPC: ... only format
    if tpc_count > 0:
        match = TPC_ONLY_PATTERN.match(value)
        if match:
            return (None, match.group(1).strip())
        # Has TPC: but doesn't match - treat as plain value
    
    # Plain value (no prefix or GCC: only) - treat as GCC portion
    return (value.strip(), None)


def format_prefixed_value(gcc_part: Optional[str], tpc_part: Optional[str]) -> str:
    """Format a prefixed value from optional GCC and TPC parts."""
    if gcc_part and tpc_part:
        return f"GCC: {gcc_part}; TPC: {tpc_part}"
    elif tpc_part:
        return f"TPC: {tpc_part}"
    elif gcc_part:
        return gcc_part
    return ""


def build_patch(tpc_sample: dict, target_sample: dict) -> Optional[dict]:
    """Build a patch dict for the target sample.
    
    Returns None if there's a core_size mismatch or no changes needed.
    Returns a dict with keys to patch otherwise.
    """
    patch = {}
    
    # Check core_size: copy if target lacks it, warn and skip if mismatch
    tpc_core_size = tpc_sample.get("core_size")
    target_core_size = target_sample.get("core_size")
    
    if tpc_core_size and target_core_size and tpc_core_size != target_core_size:
        log.warning(
            "core_size mismatch for %s: TPC=%s, target=%s — skipping sample",
            target_sample.get("uuid"),
            tpc_core_size,
            target_core_size,
        )
        return None  # Signal to skip this sample entirely
    
    if tpc_core_size and not target_core_size:
        patch["core_size"] = tpc_core_size
    
    # preservation_type: copy if target lacks it
    tpc_preservation = tpc_sample.get("preservation_type")
    target_preservation = target_sample.get("preservation_type")
    if tpc_preservation and not target_preservation:
        patch["preservation_type"] = tpc_preservation
    
    # description and processing_notes: idempotent prefixed format
    for field in ("description", "processing_notes"):
        tpc_val = tpc_sample.get(field)
        target_val = target_sample.get(field)
        
        if not tpc_val:
            continue
        
        # Parse the existing target value
        parsed = parse_prefixed_value(target_val) if target_val else ("", None)
        
        if parsed is None:
            log.warning(
                "Malformed prefixed %s in %s: %r — skipping field",
                field,
                target_sample.get("uuid"),
                target_val,
            )
            continue
        
        gcc_part, existing_tpc_part = parsed
        
        # If TPC value hasn't changed, no update needed
        if existing_tpc_part == tpc_val:
            log.debug(
                "TPC %s already up-to-date for %s — skipping field",
                field,
                target_sample.get("uuid"),
            )
            continue
        
        # Build the new formatted value
        new_value = format_prefixed_value(gcc_part, tpc_val)
        
        # Only add to patch if it's actually different
        if new_value != target_val:
            patch[field] = new_value
    
    return patch if patch else {}


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Transfer core_size, preservation_type, description, and processing_notes "
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
        "--ignore-tag",
        action="store_true",
        default=False,
        help="Include samples that already have the tpc_metadata_synced tag",
    )
    parser.add_argument(
        "--skip-tagging",
        action="store_true",
        default=False,
        help="Do not add the tpc_metadata_synced tag to patched samples",
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

    log.info("Fetching non-TPC tissue samples%s...", " (including tagged)" if args.ignore_tag else "")
    non_tpc_samples = get_non_tpc_tissue_samples(auth_key, ignore_tag=args.ignore_tag)
    log.info("Found %d non-TPC tissue samples", len(non_tpc_samples))

    patched = 0
    skipped_no_tpc = 0
    skipped_no_changes = 0
    skipped_mismatch = 0
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

            patch = build_patch(tpc_sample, sample)
            
            if patch is None:
                # core_size mismatch — already logged warning in build_patch
                skipped_mismatch += 1
                continue
            
            # Add tag unless --skip-tagging is set
            if not args.skip_tagging:
                existing_tags = sample.get("tags", [])
                if PROCESSED_TAG not in existing_tags:
                    patch["tags"] = existing_tags + [PROCESSED_TAG]

            if not patch:
                log.debug(
                    "No changes needed for %s (external_id: %s)", uuid, external_id
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
        "Done. %s: %d | Skipped (no TPC match): %d | Skipped (no changes): %d | "
        "Skipped (core_size mismatch): %d | Errors: %d",
        action,
        patched,
        skipped_no_tpc,
        skipped_no_changes,
        skipped_mismatch,
        errors,
    )


if __name__ == "__main__":
    main()
