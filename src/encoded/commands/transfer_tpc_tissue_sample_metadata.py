#!/usr/bin/env python3
"""Transfer core_size, preservation_type, description, and processing_notes from
TPC-submitted tissue_sample items to non-TPC tissue_sample items sharing the same
external_id.

Rules:
  - core_size: copied from TPC if target lacks it; cleared if TPC clears it; mismatch → warn + skip
  - preservation_type: copied from TPC if target lacks it; cleared if TPC clears it
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
  - When TPC clears core_size or preservation_type, the portal value is cleared to match
  - If a target's description or processing_notes already carries a "TPC:" portion but the
    target lacks the tpc_metadata_synced tag, and the TPC sample holds a value that would
    actually change that portion, the record is flagged for manual review instead of being
    patched: the existing TPC-prefixed text may be a manual edit, not this script's prior
    output, so it is left untouched rather than silently overwritten
  - Connection, reconciliation, or patch failures return nonzero exit code
  - Use --limit N to process at most N samples
  - Use --identifiers UUID [UUID ...] to process only specific samples
  - Patches are built from the initial candidate listing (the default search's
    embedded frame, or the per-identifier fetch), which already carries every
    field a patch needs; the sole additional authoritative database read
    happens immediately before each write and is compared against those same
    original values, so a concurrent change is detected and the stale patch
    is not applied (counted as a conflict; nonzero exit)
  - TPC samples are fetched in batches filtered by the non-TPC candidates'
    external_ids (see EXTERNAL_ID_BATCH_SIZE), rather than loading every TPC
    sample, since only TPC samples that can match a candidate are ever used
"""

import argparse
import logging
import re
import sys
import time
from typing import Iterator, Optional
from urllib.parse import quote

from dcicutils import ff_utils
from tqdm import tqdm
from tqdm.contrib.logging import logging_redirect_tqdm

from encoded.commands.utils import get_auth_key

NDRI_TPC_DISPLAY_TITLE = "NDRI TPC"
PROCESSED_TAG = "tpc_metadata_synced"
# Snovault collapses repeated same-field query params (e.g. many
# `external_id=` terms) into a single OpenSearch `terms` filter
# (dcicsnovault's lucene_builder.py), not one boolean clause per value, so
# ES's clause-count limit isn't the binding constraint. The practical limit
# is request-line size: production nginx caps it via
# `large_client_header_buffers 4 32k` (deploy/docker/production/nginx.conf).
# 50 external_ids per batch keeps every request's query string far under
# that 32KB ceiling — half of the 100-per-chunk precedent already used for
# batched accession lookups in create_qc_overview_json.py — while still
# cutting round trips by ~50-100x relative to fetching every TPC sample.
EXTERNAL_ID_BATCH_SIZE = 50
# Every one of these is a plain scalar/array property on TissueSample (none is
# a linkTo), so the default search's embedded frame and the per-identifier
# fetch both already return the true stored value for each. That is what lets
# build_patch() work directly off the initial candidate listing (see main()'s
# Phase 1) instead of an extra authoritative fetch, while the sole additional
# database read immediately before each write (Phase 3) still compares against
# these same fields to catch a concurrent change before applying a stale patch.
RELEVANT_TARGET_FIELDS = (
    "external_id",
    "core_size",
    "preservation_type",
    "description",
    "processing_notes",
    "tags",
)

# Regex patterns for parsing prefixed values
# These patterns use non-greedy matching for the GCC part and greedy matching for the TPC part.
# The separator '; TPC:' is matched explicitly to allow semicolons within the TPC value.
GCC_TPC_PATTERN = re.compile(r"^GCC:\s*(.+?);\s*TPC:\s*(.+)$", re.DOTALL)
TPC_ONLY_PATTERN = re.compile(r"^TPC:\s*(.+)$", re.DOTALL)

log = logging.getLogger(__name__)


class PatchPlan(dict):
    """Patch body plus write parameters that must not be serialized as JSON."""

    def __init__(
        self,
        *args,
        delete_fields: Optional[list[str]] = None,
        unresolved_fields: Optional[list[str]] = None,
        needs_review_fields: Optional[list[str]] = None,
        **kwargs,
    ) -> None:
        super().__init__(*args, **kwargs)
        self.delete_fields = delete_fields or []
        self.unresolved_fields = unresolved_fields or []
        self.needs_review_fields = needs_review_fields or []

    def add_on(self, check_only: bool = False) -> str:
        parameters = []
        if check_only:
            parameters.append("check_only=true")
        if self.delete_fields:
            parameters.append(f"delete_fields={','.join(self.delete_fields)}")
        return f"?{'&'.join(parameters)}" if parameters else ""


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


def _batch(items: list, batch_size: int) -> Iterator[list]:
    """Yield successive batches of at most batch_size items from a list."""
    for start in range(0, len(items), batch_size):
        yield items[start : start + batch_size]


def get_tpc_samples_by_external_ids(
    auth_key: dict,
    external_ids: list[str],
    batch_size: int = EXTERNAL_ID_BATCH_SIZE,
) -> dict[str, dict]:
    """Fetch TPC tissue samples matching the given external_ids, in batches,
    and return a dict keyed by external_id.

    Only TPC samples whose external_id appears in ``external_ids`` are
    fetched, rather than every TPC sample, since only those can ever match a
    non-TPC candidate. Duplicate detection runs across all batches together,
    exactly as it did over the single unfiltered result set.

    Raises SystemExit if duplicate external_ids are found in TPC samples.
    """
    tpc_by_external_id = {}
    duplicates = set()

    if not external_ids:
        return tpc_by_external_id

    # Query order doesn't matter and de-duplicating shrinks the batch count
    # when the same external_id appears on multiple non-TPC candidates.
    unique_external_ids = sorted(set(external_ids))

    for batch in _batch(unique_external_ids, batch_size):
        query_parts = [
            "/search/?type=TissueSample",
            f"submission_centers.display_title={NDRI_TPC_DISPLAY_TITLE.replace(' ', '+')}",
            "status!=deleted",
        ]
        query_parts.extend(f"external_id={quote(eid, safe='')}" for eid in batch)
        query = "&".join(query_parts)
        results = ff_utils.search_metadata(query, key=auth_key, page_limit=batch_size)

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


def requires_manual_review(
    target_sample: dict,
    field_name: str,
    parsed_value: Optional[tuple[Optional[str], Optional[str]]],
) -> bool:
    """Guard against overwriting a possible manual edit.

    Parsing a target's prefixed value into (gcc_part, tpc_part) is tag-independent:
    it happens the same way regardless of whether PROCESSED_TAG is present. Whether
    that parsed result is safe to act on, however, is tag-dependent: a TPC portion
    (``parsed_value[1]`` is not None) with PROCESSED_TAG absent means the target was
    never actually synced by this script, so the existing "TPC:" text may be a
    legitimate manual edit rather than this script's own prior output.

    Returns True when ``field_name``'s parsed target value already carries a TPC
    portion but ``target_sample`` lacks PROCESSED_TAG in its tags. Callers combine
    this with their own check of whether the incoming TPC value would actually
    change that portion before treating the field as needing manual review.
    """
    if parsed_value is None:
        return False
    _, existing_tpc_part = parsed_value
    return existing_tpc_part is not None and PROCESSED_TAG not in target_sample.get(
        "tags", []
    )


def has_metadata_changes(patch: dict) -> bool:
    """Check if patch has any changes besides tags.
    
    Returns True if patch contains fields other than 'tags'.
    Returns False for empty patches or patches with only tags.
    """
    delete_fields = getattr(patch, "delete_fields", [])
    return bool(delete_fields) or any(key != "tags" for key in patch)


def changed_relevant_fields(original: dict, current: dict) -> list[str]:
    """Return fields whose current values would change the cached write plan."""
    changed = []
    for field in RELEVANT_TARGET_FIELDS:
        default = [] if field == "tags" else None
        if original.get(field, default) != current.get(field, default):
            changed.append(field)
    return changed


def build_patch(
    tpc_sample: dict, target_sample: dict, skip_tagging: bool = False
) -> Optional[dict]:
    """Build a patch dict for the target sample.

    Returns None only if there's a core_size mismatch or other skip condition.
    Returns a PatchPlan (possibly with an empty JSON body) for successful
    examination. Fields to remove, malformed fields, and fields requiring
    manual review are carried separately in ``delete_fields``,
    ``unresolved_fields``, and ``needs_review_fields``.
    """
    patch = PatchPlan()
    skip_tagging_this_record = skip_tagging  # May be set True if parse fails

    # Check core_size: copy if target lacks it, clear if TPC clears it, warn and skip if mismatch
    # Treat None and empty string as absent; any other value as present
    tpc_core_size = tpc_sample.get("core_size")
    target_core_size = target_sample.get("core_size")
    tpc_has_core_size = tpc_core_size is not None and tpc_core_size != ""
    target_has_core_size = target_core_size is not None and target_core_size != ""

    # Mismatch check: if both have non-empty values that differ, skip the entire sample
    if tpc_has_core_size and target_has_core_size and tpc_core_size != target_core_size:
        log.warning(
            "core_size mismatch for %s: TPC=%s, target=%s — skipping sample",
            target_sample.get("uuid"),
            tpc_core_size,
            target_core_size,
        )
        return None  # Signal to skip this sample entirely

    # Copy if TPC has value and target lacks it
    if tpc_has_core_size and not target_has_core_size:
        patch["core_size"] = tpc_core_size
    # Clear if TPC cleared value and target has it
    elif not tpc_has_core_size and target_has_core_size:
        patch.delete_fields.append("core_size")

    # preservation_type: copy if target lacks it, clear if TPC clears it
    # Treat None and empty string as absent; any other value as present
    tpc_preservation = tpc_sample.get("preservation_type")
    target_preservation = target_sample.get("preservation_type")
    tpc_has_preservation = tpc_preservation is not None and tpc_preservation != ""
    target_has_preservation = target_preservation is not None and target_preservation != ""
    
    # Copy if TPC has value and target lacks it
    if tpc_has_preservation and not target_has_preservation:
        patch["preservation_type"] = tpc_preservation
    # Clear if TPC cleared value and target has it
    elif not tpc_has_preservation and target_has_preservation:
        patch.delete_fields.append("preservation_type")

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
            patch.unresolved_fields.append(field)
            continue

        gcc_part, existing_tpc_part = parsed

        # Convert empty string or whitespace-only to None for consistency
        tpc_val_normalized = tpc_val if (tpc_val and tpc_val.strip()) else None

        # Manual-edit protection: parsing the target's value is tag-independent
        # (it happens above regardless of PROCESSED_TAG), but acting on it is
        # tag-dependent. requires_manual_review() flags an untagged target that
        # already carries a TPC portion; combined here with a check that the
        # incoming TPC value would actually change that portion, this guards
        # against silently overwriting what may be a legitimate manual edit.
        if requires_manual_review(target_sample, field, parsed) and (
            tpc_val_normalized is not None and tpc_val_normalized != existing_tpc_part
        ):
            log.info(
                "Manual-edit protection: %s (external_id: %s) has TPC-prefixed "
                "%s without the %s tag, and TPC has a differing value — "
                "flagging for manual review instead of patching",
                target_sample.get("uuid"),
                target_sample.get("external_id"),
                field,
                PROCESSED_TAG,
            )
            patch.needs_review_fields.append(field)
            skip_tagging_this_record = True  # Don't tag a record pending review
            continue

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
    
    # Collect the GCC-side external_ids first, then fetch only the matching
    # TPC samples in batches, instead of loading every TPC sample (which was
    # slow: previously the smallest possible query was "fetch ALL TPC
    # samples" regardless of how many non-TPC candidates needed matching).
    gcc_external_ids = [
        sample["external_id"] for sample in non_tpc_samples if sample.get("external_id")
    ]
    num_batches = (
        (len(set(gcc_external_ids)) + EXTERNAL_ID_BATCH_SIZE - 1) // EXTERNAL_ID_BATCH_SIZE
        if gcc_external_ids
        else 0
    )
    log.info(
        "Loading TPC tissue samples matching %d external_id(s) in %d batch(es) of up to %d...",
        len(set(gcc_external_ids)),
        num_batches,
        EXTERNAL_ID_BATCH_SIZE,
    )
    start_time = time.monotonic()
    try:
        tpc_samples_by_external_id = get_tpc_samples_by_external_ids(
            auth_key, gcc_external_ids
        )
        elapsed = time.monotonic() - start_time
        log.info(
            "Loaded %d TPC tissue samples in %d batched quer%s (%.2fs) — "
            "batching by external_id avoids fetching the full TPC dataset",
            len(tpc_samples_by_external_id),
            num_batches,
            "y" if num_batches == 1 else "ies",
            elapsed,
        )
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
    unresolved = 0
    needs_review = 0
    conflicts = 0
    errors = 0
    needs_review_records = []  # (uuid, external_id, fields flagged for review)

    # Phase 1: Build all patches and collect them for validation
    patches_to_apply = []  # (uuid, external_id, patch, authoritative snapshot)
    
    with logging_redirect_tqdm():
        for sample in tqdm(non_tpc_samples, desc="Building patches", unit="sample"):
            uuid = sample.get("uuid")

            # The candidate listing (the default search's embedded frame, or the
            # per-identifier fetch under --identifiers) already carries every
            # RELEVANT_TARGET_FIELDS value build_patch needs, so it is used
            # directly here rather than issuing a redundant authoritative fetch.
            # The one authoritative database read this command performs happens
            # immediately before each write, in Phase 3 below, where it is
            # compared against this same snapshot to detect a concurrent change.
            external_id = sample.get("external_id")
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

            patch = build_patch(tpc_sample, sample, skip_tagging=args.skip_tagging)

            if patch is None:
                # core_size mismatch — already logged warning in build_patch
                skipped_mismatch += 1
                continue

            if patch.needs_review_fields:
                # Possible manual edit — exclude entirely from the automatic
                # patch phase and surface it for human inspection instead.
                needs_review += 1
                needs_review_records.append(
                    (uuid, external_id, list(patch.needs_review_fields))
                )
                continue

            if patch.unresolved_fields:
                unresolved += 1
                log.warning(
                    "Unresolved prefixed metadata for %s (external_id: %s): %s",
                    uuid,
                    external_id,
                    ", ".join(patch.unresolved_fields),
                )
                if not patch and not patch.delete_fields:
                    continue

            if not patch and not patch.delete_fields:
                # Empty patch = already tagged and no changes needed
                log.debug(
                    "No changes needed for %s (external_id: %s)", uuid, external_id
                )
                skipped_no_changes += 1
                continue
            
            patches_to_apply.append((uuid, external_id, patch, sample))
    
    # Phase 2: Validate all patches before applying any
    if patches_to_apply and args.execute:
        log.info("Validating %d patches before applying...", len(patches_to_apply))
        validation_errors = []
        
        with logging_redirect_tqdm():
            for uuid, external_id, patch, original_sample in tqdm(
                patches_to_apply, desc="Validating patches", unit="patch"
            ):
                try:
                    ff_utils.patch_metadata(
                        patch,
                        obj_id=uuid,
                        key=auth_key,
                        add_on=patch.add_on(check_only=True),
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
            for uuid, external_id, patch, original_sample in tqdm(
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
                        current_sample = ff_utils.get_metadata(
                            uuid,
                            key=auth_key,
                            add_on="frame=object&datastore=database",
                        )
                        changed_fields = changed_relevant_fields(
                            original_sample, current_sample
                        )
                        if changed_fields:
                            log.error(
                                "Concurrent change detected for %s "
                                "(external_id: %s) in %s — stale patch not applied",
                                uuid,
                                external_id,
                                ", ".join(changed_fields),
                            )
                            conflicts += 1
                            continue
                        ff_utils.patch_metadata(
                            patch,
                            obj_id=uuid,
                            key=auth_key,
                            add_on=patch.add_on(),
                        )
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
        "Skipped (no changes): %d | Skipped (core_size mismatch): %d | "
        "Unresolved: %d | Needs review: %d | Conflicts: %d | Errors: %d",
        action,
        patched,
        tagged_only,
        skipped_no_tpc,
        skipped_no_changes,
        skipped_mismatch,
        unresolved,
        needs_review,
        conflicts,
        errors,
    )

    if needs_review_records:
        log.warning(
            "The following %d record(s) need manual review: existing TPC-prefixed "
            "content without the %s tag, where TPC holds a differing value that "
            "was NOT applied. Inspect and resolve manually:",
            len(needs_review_records),
            PROCESSED_TAG,
        )
        for uuid, external_id, fields in needs_review_records:
            log.warning(
                "  - uuid=%s external_id=%s fields=%s",
                uuid,
                external_id,
                ", ".join(fields),
            )

    # Unresolved prefixed values and records needing manual review require
    # operator attention just like errors.
    if errors > 0 or unresolved > 0 or needs_review > 0 or conflicts > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
