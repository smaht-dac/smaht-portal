#!/usr/bin/env python3
"""Transfer core_size, preservation_type, description, and processing_notes from
TPC-submitted tissue_sample items to non-TPC tissue_sample items sharing the same
external_id.

Rules:
  - core_size: copied from TPC only if the target item lacks it; mismatch → warn + skip
  - preservation_type: copied from TPC only if the target item lacks it
  - description / processing_notes: prefixed format "GCC: <gcc>; TPC: <tpc>" is parsed
    and made idempotent; GCC portion is preserved, TPC portion is replaced if changed.
    TPC values may contain semicolons; the parser uses '; TPC:' as the separator.
  - TPC items are never modified
  - Non-TPC items with no matching TPC external_id are skipped
  - By default, only non-TPC samples lacking the tpc_metadata_synced tag are selected
  - Use --ignore-tag to include already-tagged samples
  - Use --skip-tagging to suppress automatic tag addition
  - Records examined receive the tpc_metadata_synced tag unless:
    • --skip-tagging is set
    • The tag is already present
    • A core_size mismatch occurred (sample is skipped)
    • A parse error occurred (record needs human intervention)
  - Tag-only changes ARE sent to the server but counted separately from metadata changes
  - Parse failures flag the record for resolution and are not tagged as synced
  - When TPC clears description or processing_notes, the TPC portion is removed from target
    (GCC portion is preserved)
  - Connection, reconciliation, or patch failures return nonzero exit code
  - Use --limit N to process at most N samples
  - Use --identifiers UUID [UUID ...] to process only specific samples
"""

import argparse
import logging
import re
import sys
from typing import Optional
from urllib.parse import quote

from dcicutils import ff_utils
from tqdm import tqdm
from tqdm.contrib.logging import logging_redirect_tqdm

from encoded.commands.utils import get_auth_key

NDRI_TPC_DISPLAY_TITLE = "NDRI TPC"
PROCESSED_TAG = "tpc_metadata_synced"

# Regex patterns for parsing prefixed values
# These patterns use non-greedy matching for the GCC part and greedy matching for the TPC part.
# The separator '; TPC:' is matched explicitly to allow semicolons within the TPC value.
GCC_TPC_PATTERN = re.compile(r"^GCC:\s*(.+?);\s*TPC:\s*(.+)$", re.DOTALL)
TPC_ONLY_PATTERN = re.compile(r"^TPC:\s*(.+)$", re.DOTALL)

log = logging.getLogger(__name__)


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
    return ff_utils.search_metadata(query, key=auth_key, page_limit=50)


def get_all_tpc_samples(auth_key: dict) -> dict[str, dict]:
    """Fetch all TPC tissue samples and return a dict keyed by external_id.
    
    Raises SystemExit if duplicate external_ids are found in TPC samples.
    """
    query = (
        "/search/?type=TissueSample"
        f"&submission_centers.display_title={NDRI_TPC_DISPLAY_TITLE.replace(' ', '+')}"
        "&status!=deleted"
    )
    results = ff_utils.search_metadata(query, key=auth_key, page_limit=50)
    
    tpc_by_external_id = {}
    duplicates = set()
    
    for sample in results:
        external_id = sample.get("external_id")
        if not external_id:
            log.warning("TPC sample %s has no external_id — skipping", sample.get("uuid"))
            continue
        
        if external_id in tpc_by_external_id:
            duplicates.add(external_id)
            log.error(
                "Duplicate TPC external_id found: %s (UUIDs: %s, %s)",
                external_id,
                tpc_by_external_id[external_id].get("uuid"),
                sample.get("uuid"),
            )
        else:
            tpc_by_external_id[external_id] = sample
    
    if duplicates:
        log.error(
            "Found %d duplicate TPC external_id(s): %s. Cannot proceed safely.",
            len(duplicates),
            ", ".join(sorted(duplicates)),
        )
        sys.exit(1)
    
    return tpc_by_external_id


def parse_prefixed_value(value: str) -> Optional[tuple[Optional[str], Optional[str]]]:
    """Parse a prefixed value into (gcc_part, tpc_part).

    Returns None if the value is malformed.
    Returns (None, tpc_value) for "TPC: <value>" format.
    Returns (gcc_value, tpc_value) for "GCC: <gcc>; TPC: <tpc>" format.
    """
    if not value:
        return ("", None)

    # Strip surrounding whitespace before parsing
    value = value.strip()

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


def has_metadata_changes(patch: dict) -> bool:
    """Check if patch has any changes besides tags.
    
    Returns True if patch contains fields other than 'tags'.
    Returns False for empty patches or patches with only tags.
    """
    if not patch:
        return False
    return any(key != "tags" for key in patch.keys())


def build_patch(
    tpc_sample: dict, target_sample: dict, skip_tagging: bool = False
) -> Optional[dict]:
    """Build a patch dict for the target sample.

    Returns None only if there's a core_size mismatch or other skip condition.
    Returns a dict (possibly empty) for successful examination.
    The dict may contain only tags (for records with no metadata changes).
    """
    patch = {}
    skip_tagging_this_record = skip_tagging  # May be set True if parse fails

    # Check core_size: copy if target lacks it, warn and skip if mismatch
    # Treat None and empty string as absent; any other value as present
    tpc_core_size = tpc_sample.get("core_size")
    target_core_size = target_sample.get("core_size")
    tpc_has_core_size = tpc_core_size is not None and tpc_core_size != ""
    target_has_core_size = target_core_size is not None and target_core_size != ""

    if tpc_has_core_size and target_has_core_size and tpc_core_size != target_core_size:
        log.warning(
            "core_size mismatch for %s: TPC=%s, target=%s — skipping sample",
            target_sample.get("uuid"),
            tpc_core_size,
            target_core_size,
        )
        return None  # Signal to skip this sample entirely

    if tpc_has_core_size and not target_has_core_size:
        patch["core_size"] = tpc_core_size

    # preservation_type: copy if target lacks it
    # Treat None and empty string as absent; any other value as present
    tpc_preservation = tpc_sample.get("preservation_type")
    target_preservation = target_sample.get("preservation_type")
    tpc_has_preservation = tpc_preservation is not None and tpc_preservation != ""
    target_has_preservation = target_preservation is not None and target_preservation != ""
    if tpc_has_preservation and not target_has_preservation:
        patch["preservation_type"] = tpc_preservation

    # description and processing_notes: idempotent prefixed format WITH CLEARING
    for field in ("description", "processing_notes"):
        tpc_val = tpc_sample.get(field)
        target_val = target_sample.get(field)

        # Parse the existing target value
        parsed = parse_prefixed_value(target_val) if target_val else ("", None)

        if parsed is None:
            log.warning(
                "Malformed prefixed %s in %s: %r — skipping field and not tagging",
                field,
                target_sample.get("uuid"),
                target_val,
            )
            skip_tagging_this_record = True  # Don't tag if we couldn't process
            continue

        gcc_part, existing_tpc_part = parsed

        # Convert empty string or whitespace-only to None for consistency
        tpc_val_normalized = tpc_val if (tpc_val and tpc_val.strip()) else None

        # If TPC has cleared the field, remove TPC portion from target
        if not tpc_val_normalized:
            if existing_tpc_part:  # Target has TPC portion that needs clearing
                new_value = format_prefixed_value(gcc_part, None)
                if new_value != target_val:
                    patch[field] = new_value
            continue  # TPC has no value, either cleared or never set

        # TPC has a value - proceed with normal sync logic
        # If TPC value hasn't changed, no update needed
        if existing_tpc_part == tpc_val_normalized:
            log.debug(
                "TPC %s already up-to-date for %s — skipping field",
                field,
                target_sample.get("uuid"),
            )
            continue

        # Build the new formatted value
        new_value = format_prefixed_value(gcc_part, tpc_val_normalized)

        # Only add to patch if it's actually different
        if new_value != target_val:
            patch[field] = new_value

    # Add tag for successfully examined records
    # Tag is added AFTER metadata processing, and ONLY if no parse errors
    if not skip_tagging_this_record:
        existing_tags = target_sample.get("tags", [])
        if PROCESSED_TAG not in existing_tags:
            patch["tags"] = existing_tags + [PROCESSED_TAG]

    # Return the patch (may be empty dict if tag is already present and no changes)
    return patch


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
        "--limit",
        type=int,
        metavar="N",
        help="Process at most N samples (for rehearsal or testing)",
    )
    parser.add_argument(
        "--identifiers",
        nargs="+",
        metavar="UUID",
        help="Process only the specified sample UUIDs or aliases",
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
        sys.exit(1)

    # Fetch non-TPC samples, optionally filtered by identifiers or limit
    if args.identifiers:
        log.info("Fetching specified samples: %s", ", ".join(args.identifiers))
        non_tpc_samples = []
        for identifier in args.identifiers:
            try:
                sample = ff_utils.get_metadata(identifier, key=auth_key)
                # Verify it's a TissueSample and not from TPC
                if sample.get("@type", [None])[0] != "TissueSample":
                    log.warning("Identifier %s is not a TissueSample — skipping", identifier)
                    continue
                submission_center = sample.get("submission_centers", [{}])[0]
                if submission_center.get("display_title") == NDRI_TPC_DISPLAY_TITLE:
                    log.warning("Identifier %s is a TPC sample — skipping", identifier)
                    continue
                non_tpc_samples.append(sample)
            except Exception as exc:
                log.error("Failed to fetch %s: %s", identifier, exc)
                sys.exit(1)
        log.info("Found %d specified non-TPC tissue samples", len(non_tpc_samples))
    else:
        log.info("Fetching non-TPC tissue samples%s...", " (including tagged)" if args.ignore_tag else "")
        non_tpc_samples = get_non_tpc_tissue_samples(auth_key, ignore_tag=args.ignore_tag)
        log.info("Found %d non-TPC tissue samples", len(non_tpc_samples))
        
        if args.limit:
            non_tpc_samples = non_tpc_samples[:args.limit]
            log.info("Limited to first %d samples", len(non_tpc_samples))
    
    # Bulk-load all TPC samples to avoid N+1 queries and detect duplicates
    log.info("Loading all TPC tissue samples...")
    try:
        tpc_samples_by_external_id = get_all_tpc_samples(auth_key)
        log.info("Loaded %d TPC tissue samples", len(tpc_samples_by_external_id))
    except SystemExit:
        raise  # Re-raise to preserve exit code
    except Exception as exc:
        log.error("Failed to load TPC samples: %s", exc)
        sys.exit(1)

    patched = 0  # Records with metadata changes
    tagged_only = 0  # Records with only tag added (no metadata changes)
    skipped_no_tpc = 0
    skipped_no_changes = 0  # Records that didn't need any changes (even tag)
    skipped_mismatch = 0
    errors = 0
    
    # Phase 1: Build all patches and collect them for validation
    patches_to_apply = []  # List of (uuid, external_id, patch, fresh_sample)
    
    with logging_redirect_tqdm():
        for sample in tqdm(non_tpc_samples, desc="Building patches", unit="sample"):
            external_id = sample.get("external_id")
            uuid = sample.get("uuid")

            if not external_id:
                log.debug("Sample %s has no external_id — skipping", uuid)
                skipped_no_tpc += 1
                continue

            log.debug("Looking up TPC sample for external_id %s", external_id)
            tpc_sample = tpc_samples_by_external_id.get(external_id)
            if not tpc_sample:
                log.debug(
                    "No TPC sample for external_id %s (uuid: %s) — skipping",
                    external_id,
                    uuid,
                )
                skipped_no_tpc += 1
                continue
            
            # Freshly fetch the target sample to avoid concurrent edit issues
            try:
                fresh_sample = ff_utils.get_metadata(uuid, key=auth_key)
            except Exception as exc:
                log.error("Failed to fetch %s: %s", uuid, exc)
                errors += 1
                continue

            patch = build_patch(tpc_sample, fresh_sample, skip_tagging=args.skip_tagging)

            if patch is None:
                # core_size mismatch — already logged warning in build_patch
                skipped_mismatch += 1
                continue

            if not patch:
                # Empty patch = already tagged and no changes needed
                log.debug(
                    "No changes needed for %s (external_id: %s)", uuid, external_id
                )
                skipped_no_changes += 1
                continue
            
            patches_to_apply.append((uuid, external_id, patch, fresh_sample))
    
    # Phase 2: Validate all patches before applying any
    if patches_to_apply and args.execute:
        log.info("Validating %d patches before applying...", len(patches_to_apply))
        validation_errors = []
        
        with logging_redirect_tqdm():
            for uuid, external_id, patch, fresh_sample in tqdm(
                patches_to_apply, desc="Validating patches", unit="patch"
            ):
                try:
                    ff_utils.patch_metadata(
                        patch, obj_id=uuid, key=auth_key, check_only=True
                    )
                except Exception as exc:
                    log.error(
                        "Validation failed for %s (external_id: %s): %s",
                        uuid,
                        external_id,
                        exc,
                    )
                    validation_errors.append((uuid, external_id, exc))
        
        if validation_errors:
            log.error(
                "Validation failed for %d sample(s). Cannot proceed safely.",
                len(validation_errors),
            )
            for uuid, external_id, exc in validation_errors:
                log.error("  - %s (external_id: %s): %s", uuid, external_id, exc)
            sys.exit(1)
        
        log.info("All patches validated successfully")
    
    # Phase 3: Apply patches
    if not patches_to_apply:
        log.info("No patches to apply")
    else:
        with logging_redirect_tqdm():
            for uuid, external_id, patch, fresh_sample in tqdm(
                patches_to_apply, desc="Applying patches", unit="patch"
            ):
                has_metadata = has_metadata_changes(patch)
                
                if not args.execute:
                    if has_metadata:
                        log.info(
                            "[DRY RUN] Would patch %s (external_id: %s): %s",
                            uuid,
                            external_id,
                            patch,
                        )
                        patched += 1
                    else:
                        log.info(
                            "[DRY RUN] Would add tag to %s (external_id: %s)",
                            uuid,
                            external_id,
                        )
                        tagged_only += 1
                else:
                    try:
                        ff_utils.patch_metadata(patch, obj_id=uuid, key=auth_key)
                        if has_metadata:
                            log.info(
                                "Patched %s (external_id: %s): %s",
                                uuid,
                                external_id,
                                list(patch.keys()),
                            )
                            patched += 1
                        else:
                            log.info(
                                "Tagged %s (external_id: %s)",
                                uuid,
                                external_id,
                            )
                            tagged_only += 1
                    except Exception as exc:
                        log.error("Failed to patch %s: %s", uuid, exc)
                        errors += 1

    action = "Patched" if args.execute else "Would patch"
    log.info(
        "Done. %s: %d | Tagged only: %d | Skipped (no TPC match): %d | "
        "Skipped (no changes): %d | Skipped (core_size mismatch): %d | Errors: %d",
        action,
        patched,
        tagged_only,
        skipped_no_tpc,
        skipped_no_changes,
        skipped_mismatch,
        errors,
    )
    
    # Exit with nonzero status if there were any errors
    if errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
