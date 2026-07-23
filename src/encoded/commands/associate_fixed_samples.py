"""
Populate (or remove) `linked_fixed_samples` on GCC-submitted fresh/frozen
TissueSamples, pointing to TPC-submitted fixed TissueSamples from the same
tissue block.

Every TPC-submitted fixed TissueSample from a tissue block is linked to every
GCC-submitted fresh/frozen TissueSample from that same block (donor +
protocol-pair match via FRESH_TO_FIXED_PROTOCOL_MAP) -- not just spatially
"adjacent" aliquots, and not TPC-submitted fresh samples (those don't need
the link; a GCC sample and its matching TPC sample already share the same
external_id and sample_sources per the validation in
types/tissue_sample.py:run_sample_metadata_validation, so donor/protocol
identity can be read directly off the GCC sample without looking up a TPC
counterpart). See
c4-scripts/ajs/NOTES/adjacent_fixed_sample_linking_session_2026-07-10.md for
the design history.

Core behavior:
- Selects a set of TissueSamples to operate on, via one of three mutually
  exclusive scopes: --all, --search-query, or --identifiers /
  --identifiers-file. Populate mode only ever selects samples still eligible
  as a GCC fresh/frozen source today; --delete deliberately reaches further
  (see Reconciliation below), since a stale link needs to be reachable for
  cleanup even after its source is no longer eligible.
- By default (populate mode), computes each fresh sample's fixed siblings
  and PATCHes `linked_fixed_samples`, skipping samples that are already
  up to date.
- With --delete, instead removes `linked_fixed_samples` (via `delete_fields`,
  a true removal of the key -- not an empty-array patch) from every sample
  in scope that currently has it set. This makes the operation reversible.
- Reconciliation contract: `linked_fixed_samples` is meant to always reflect
  current reality, not a point-in-time snapshot. So populate mode also
  clears stale links -- both when a donor/protocol group's fixed
  counterpart has disappeared, and (in --all scope only, since it's the
  only scope with full visibility) via a sweep that finds every TissueSample
  currently holding the field and clears it on any that this run didn't
  otherwise handle (e.g. a source that's since changed submission center or
  preservation_type).
- Warns when a donor/protocol group has fresh samples but no fixed
  counterpart, or (in --all scope only) fixed samples with no fresh
  counterpart ("orphaned" fixed samples, whose PathologyReport would never
  surface via TissueSample.associated_pathology_reports).
- Dry-run mode previews all planned operations without executing them.

Usage:
    python associate_fixed_samples.py --env ENV (--all | --search-query Q | --identifiers ID [ID ...] | --identifiers-file PATH) [options]

Options:
    --env, -e ENV
        Name of the environment as defined in the local keys file. Required.

    --all
        Process every GCC-submitted fresh/frozen TissueSample.

    --search-query QUERY
        Additional search filter appended to the base GCC fresh/frozen
        search, e.g. "linked_fixed_samples=No value" to target only samples
        that don't have the field populated yet.

    --identifiers ID [ID ...]
        One or a few TissueSample accessions, uuids, or submitted_ids. For
        populate, must resolve to GCC-submitted fresh/frozen samples; for
        --delete, any TissueSample identifier is accepted (so a now-ineligible
        record can still be targeted directly for cleanup).

    --identifiers-file PATH
        Path to a file with one identifier per line, for bulk targeted runs.

    --delete
        Remove `linked_fixed_samples` instead of populating it, for every
        sample in scope that currently has it set. Unlike populate, --delete's
        scopes are not restricted to today's GCC-fresh/frozen eligibility, so
        it can reach and clean up records that have since become ineligible.

    --dry-run
        Show planned operations but do not execute them.

Examples:
    # Dry run a full population pass
    python associate_fixed_samples.py --env devtest --all --dry-run

    # Populate only samples that don't have the field yet
    python associate_fixed_samples.py --env devtest --search-query "linked_fixed_samples=No value"

    # Fix up a couple of specific samples
    python associate_fixed_samples.py --env devtest --identifiers SMHT001-3I-001 SMHT001-3I-003

    # Undo everything (reversible)
    python associate_fixed_samples.py --env devtest --all --delete
"""

import argparse
import pprint
from typing import Any, Dict, List, Optional, Set, Tuple, Union

from dcicutils import ff_utils  # noqa

from encoded.commands.utils import get_auth_key
from encoded.item_utils import (
    item as item_utils,
    tissue_sample as tissue_sample_utils,
)
from encoded.item_utils.constants.tissue_sample import (
    FRESH_PRESERVATION_TYPES,
    FIXED_PRESERVATION_TYPE,
    FRESH_TO_FIXED_PROTOCOL_MAP,
)
from encoded.item_utils.utils import RequestHandler

pp = pprint.PrettyPrinter(indent=2)


BASE_SEARCH_FILTER = "/search/?type=TissueSample&status!=deleted"

# Fixed samples (pathology's domain) are always TPC-submitted, so the fixed
# side keeps this restriction. The fresh side deliberately does NOT use this
# filter -- see _is_tpc_submitted() and _search_fresh_samples().
TPC_SEARCH_FILTER = f"{BASE_SEARCH_FILTER}&submission_centers.display_title=NDRI+TPC"

# Matches the identifier/display_title pair used in types/tissue_sample.py's
# NDRI_TPC_ID/NDRI_TPC_DT and run_sample_metadata_validation's tpc/non_tpc split.
NDRI_TPC_ID = "ndri_tpc"
NDRI_TPC_DT = "NDRI TPC"

LINKED_FIXED_SAMPLES_FIELD = "linked_fixed_samples"

# FRESH_PRESERVATION_TYPES, FIXED_PRESERVATION_TYPE, and FRESH_TO_FIXED_PROTOCOL_MAP
# live in encoded.item_utils.constants.tissue_sample (imported above) rather than here,
# since the linked_fixed_samples validator in types/tissue_sample.py needs the same
# data and types/ must not import from commands/.


class FixedSampleAssociator:
    """Compute and patch (or remove) `linked_fixed_samples` on fresh/frozen TissueSamples."""

    def __init__(self, auth_key: Dict[str, str], dry_run: bool = False) -> None:
        self.key = auth_key
        self.request_handler = RequestHandler(
            auth_key=auth_key, frame="object", datastore="database"
        )
        self.dry_run = dry_run
        self.warnings: List[str] = []
        self.patch_infos: List[str] = []
        self.operations: List[Dict[str, Any]] = []
        self._donor_uuid_cache: Dict[str, str] = {}

    # ---- selection ----

    def get_target_samples(
        self,
        scope: str,
        action: str,
        search_query: Optional[str] = None,
        identifiers: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """action is "populate" or "delete". Populate only ever targets samples
        still eligible as a GCC fresh/frozen source today. Delete deliberately
        reaches further: a record that's become ineligible since it was last
        populated (its fixed counterpart deleted, or its own preservation_type
        /submission_center changed) must still be reachable for cleanup, or a
        stale link could survive indefinitely for anything other than a full
        --all reconciliation sweep."""
        require_eligible = action != "delete"
        if scope == "all":
            return self._search_all_current_holders() if action == "delete" else self._search_fresh_samples()
        if scope == "query":
            if action == "delete":
                return self._search_by_query(search_query)
            return self._search_fresh_samples(extra_query=search_query)
        if scope == "identifiers":
            return self._get_samples_by_identifier(identifiers or [], require_eligible=require_eligible)
        raise ValueError(f"Unknown scope: {scope}")

    def _search_fresh_samples(
        self, extra_query: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Deliberately does not filter by submission center in the search
        itself -- submission_centers is multi-valued and `!=` negation
        semantics against it aren't something we've verified, so instead we
        fetch broadly and filter to non-TPC (i.e. GCC) in Python via
        _is_tpc_submitted(), mirroring run_sample_metadata_validation's
        proven tpc/non_tpc split."""
        preservation_filter = "".join(
            f"&preservation_type={ptype.replace(' ', '+')}"
            for ptype in FRESH_PRESERVATION_TYPES
        )
        search_filter = f"{BASE_SEARCH_FILTER}{preservation_filter}"
        if extra_query:
            search_filter += f"&{extra_query}"
        samples = ff_utils.search_metadata(search_filter, key=self.key)
        return [sample for sample in samples if not self._is_tpc_submitted(sample)]

    def _search_all_current_holders(self) -> List[Dict[str, Any]]:
        """Every TissueSample that currently has linked_fixed_samples populated,
        regardless of current preservation_type/submission_center/status. This
        is the reconciliation sweep's source of truth for "everything that
        currently claims a link" -- used by --all's stale-holder cleanup pass
        (see _clear_stale_holders) and by --all --delete."""
        search_filter = f"/search/?type=TissueSample&{LINKED_FIXED_SAMPLES_FIELD}!=No value"
        return ff_utils.search_metadata(search_filter, key=self.key)

    def _search_by_query(self, query: Optional[str]) -> List[Dict[str, Any]]:
        """Used for --search-query --delete: a raw search with no
        preservation_type/submission_center restriction, so delete isn't
        accidentally confined to today's still-eligible GCC samples."""
        search_filter = BASE_SEARCH_FILTER
        if query:
            search_filter += f"&{query}"
        return ff_utils.search_metadata(search_filter, key=self.key)

    def _get_samples_by_identifier(
        self, identifiers: List[str], require_eligible: bool
    ) -> List[Dict[str, Any]]:
        """Resolve identifiers one at a time (not via RequestHandler.get_items,
        which dedupes/drops missing items) so each bad identifier gets its own
        warning rather than silently disappearing. When require_eligible is
        False (delete scope), the fresh/frozen + non-TPC eligibility checks are
        skipped entirely, so an operator can target and clear any record by
        identifier even if it's no longer a valid populate source."""
        valid_samples = []
        for identifier in identifiers:
            sample = self.request_handler.get_item(identifier)
            if not sample:
                self.add_warning(f"Identifier {identifier} did not resolve to an item - skipping.")
                continue
            if item_utils.get_type(sample) != "TissueSample":
                self.add_warning(f"{identifier} is not a TissueSample - skipping.")
                continue
            if require_eligible:
                if sample.get("preservation_type") not in FRESH_PRESERVATION_TYPES:
                    self.add_warning(
                        f"{identifier} has preservation_type "
                        f"{sample.get('preservation_type')!r}, not fresh/frozen - skipping."
                    )
                    continue
                if self._is_tpc_submitted(sample):
                    self.add_warning(
                        f"{identifier} is TPC-submitted, not GCC - skipping (only "
                        f"GCC-submitted fresh/frozen samples are valid targets)."
                    )
                    continue
            valid_samples.append(sample)
        return valid_samples

    def _is_tpc_submitted(self, item: Dict[str, Any]) -> bool:
        """Works against either frame this script encounters: search results
        (submission_centers entries embedded as dicts with display_title) or
        RequestHandler frame="object" results (entries as bare identifiers,
        resolved here the same way types/tissue_sample.py:is_tpc_submission does)."""
        for center in item_utils.get_submission_centers(item):
            if isinstance(center, dict):
                if center.get("display_title") == NDRI_TPC_DT:
                    return True
            else:
                center_item = self.request_handler.get_item(center)
                if item_utils.get_identifier(center_item) == NDRI_TPC_ID:
                    return True
        return False

    # ---- populate action ----

    def compute_and_patch(self, fresh_samples: List[Dict[str, Any]], scope: str) -> None:
        fresh_by_donor_protocol = self._group_by_donor_and_protocol(fresh_samples)
        donor_uuids = sorted({donor_uuid for donor_uuid, _ in fresh_by_donor_protocol})

        if donor_uuids:
            if scope == "all":
                fixed_index = self._build_fixed_sample_index_global()
            else:
                fixed_index = self._build_fixed_sample_index_for_donors(donor_uuids)

            for (donor_uuid, fresh_protocol), fresh_group in fresh_by_donor_protocol.items():
                fixed_protocol = FRESH_TO_FIXED_PROTOCOL_MAP.get(fresh_protocol)
                fixed_group = fixed_index.get((donor_uuid, fixed_protocol), [])
                if not fixed_group:
                    self.add_warning(
                        f"No TPC fixed counterpart (protocol {fixed_protocol}) for donor "
                        f"{donor_uuid}, GCC fresh protocol {fresh_protocol} "
                        f"({len(fresh_group)} fresh sample(s)). This can be expected if "
                        f"TPC hasn't submitted/processed this block's fixed samples yet."
                    )
                    # Reconciliation: if any of these fresh samples still carry a
                    # link from before the fixed counterpart disappeared, clear
                    # it rather than leaving stale data behind.
                    for fresh_sample in fresh_group:
                        self._add_clear_if_stale(fresh_sample)
                    continue
                fixed_uuids = sorted({item_utils.get_uuid(f) for f in fixed_group})
                for fresh_sample in fresh_group:
                    self._add_populate_operation(fresh_sample, fixed_uuids)

            if scope == "all":
                # Only meaningful for a full run: a scoped fixed-sample index only
                # contains the donors already touched by the fresh side, so every
                # group would trivially look "covered" regardless of whether the
                # specific fresh protocol was actually in scope.
                self._check_for_orphaned_fixed_samples(fresh_by_donor_protocol, fixed_index)

        if scope == "all":
            handled_uuids = {
                item_utils.get_uuid(sample)
                for group in fresh_by_donor_protocol.values()
                for sample in group
            }
            self._clear_stale_holders(handled_uuids)

    def _normalize_link_identifier(self, value: Union[str, Dict[str, Any]]) -> str:
        """linked_fixed_samples entries can appear as: a dict with 'uuid' (search
        results / embedded frame), a bare uuid string, or a resource-path/@id
        string like '/tissue-samples/<uuid>/' (frame="object" -- used by the
        RequestHandler in --identifiers scope -- canonicalizes stored linkTo
        values this way). Normalize all three to a bare uuid so idempotency
        comparisons are frame-independent; without this, an --identifiers run
        against an already-correct record would compare resource paths against
        bare uuids, never match, and needlessly re-PATCH/reindex every time."""
        if isinstance(value, dict):
            return value.get("uuid", "")
        if isinstance(value, str) and value.startswith("/"):
            segments = [segment for segment in value.strip("/").split("/") if segment]
            return segments[-1] if segments else value
        return value

    def _add_populate_operation(
        self, fresh_sample: Dict[str, Any], fixed_uuids: List[str]
    ) -> None:
        current = sorted(
            self._normalize_link_identifier(item)
            for item in (fresh_sample.get(LINKED_FIXED_SAMPLES_FIELD) or [])
        )
        identifier = self._get_identifier_to_report(fresh_sample)
        if current == fixed_uuids:
            self.patch_infos.append(
                f"  - {identifier}: already up to date ({len(fixed_uuids)} linked)."
            )
            return
        self.patch_infos.append(
            f"  - {identifier}: {LINKED_FIXED_SAMPLES_FIELD} -> {len(fixed_uuids)} fixed sample(s)."
        )
        self.operations.append(
            {
                "uuid": item_utils.get_uuid(fresh_sample),
                "patch_body": {LINKED_FIXED_SAMPLES_FIELD: fixed_uuids},
                "delete_fields": None,
            }
        )

    def _add_clear_if_stale(self, sample: Dict[str, Any]) -> None:
        """If `sample` currently has linked_fixed_samples populated but is no
        longer part of a valid donor/protocol group (its fixed counterpart is
        gone, or the sample itself is no longer eligible), clear the field.
        Leaving stale data in place would actively mislead
        associated_pathology_reports -- worse than having no data at all."""
        if not sample.get(LINKED_FIXED_SAMPLES_FIELD):
            return
        identifier = self._get_identifier_to_report(sample)
        self.patch_infos.append(
            f"  - {identifier}: clearing stale {LINKED_FIXED_SAMPLES_FIELD} (no longer valid)."
        )
        self.operations.append(
            {
                "uuid": item_utils.get_uuid(sample),
                "patch_body": {},
                "delete_fields": LINKED_FIXED_SAMPLES_FIELD,
            }
        )

    def _clear_stale_holders(self, handled_uuids: Set[str]) -> None:
        """Full-sweep reconciliation (--all only): find every TissueSample that
        currently has linked_fixed_samples populated, and clear it on any that
        weren't handled by this run's donor/protocol grouping above. These are
        records that are no longer valid sources (fixed counterpart deleted,
        preservation_type/submission_center changed since last populated), or
        that never should have had the field at all (e.g. an unmapped
        protocol like Blood/Buccal Swab/Fibroblast)."""
        for holder in self._search_all_current_holders():
            if item_utils.get_uuid(holder) not in handled_uuids:
                self._add_clear_if_stale(holder)

    def _check_for_orphaned_fixed_samples(
        self,
        fresh_by_donor_protocol: Dict[Tuple[str, str], List[Dict[str, Any]]],
        fixed_index: Dict[Tuple[str, str], List[Dict[str, Any]]],
    ) -> None:
        # 1J and 1K both map to fixed protocol 1L (benchmarking skin specimen/core),
        # so a naive {v: k for k, v in ...} reverse map drops one of them and
        # false-positives an "orphaned" warning on a fixed group that's actually
        # correctly linked via the other fresh protocol. get_fixed_to_fresh_protocols()
        # returns the full fixed_protocol -> {fresh_protocols} mapping instead.
        fixed_to_fresh_protocols = tissue_sample_utils.get_fixed_to_fresh_protocols()
        for (donor_uuid, fixed_protocol), fixed_group in fixed_index.items():
            fresh_protocols = fixed_to_fresh_protocols.get(fixed_protocol, set())
            covered = any(
                (donor_uuid, fresh_protocol) in fresh_by_donor_protocol
                for fresh_protocol in fresh_protocols
            )
            if not covered:
                self.add_warning(
                    f"Orphaned TPC fixed sample(s) for donor {donor_uuid}, protocol "
                    f"{fixed_protocol}: no GCC fresh/frozen counterpart (protocol(s) "
                    f"{sorted(fresh_protocols)}) found. This can be expected if GCC "
                    f"hasn't submitted sequencing samples for this block yet -- but "
                    f"until they do, any PathologyReport on these sample(s) will not "
                    f"surface via associated_pathology_reports."
                )

    # ---- delete action ----

    def compute_and_delete(self, fresh_samples: List[Dict[str, Any]]) -> None:
        for fresh_sample in fresh_samples:
            identifier = self._get_identifier_to_report(fresh_sample)
            if not fresh_sample.get(LINKED_FIXED_SAMPLES_FIELD):
                self.patch_infos.append(
                    f"  - {identifier}: no {LINKED_FIXED_SAMPLES_FIELD} to remove."
                )
                continue
            self.patch_infos.append(f"  - {identifier}: remove {LINKED_FIXED_SAMPLES_FIELD}.")
            self.operations.append(
                {
                    "uuid": item_utils.get_uuid(fresh_sample),
                    "patch_body": {},
                    "delete_fields": LINKED_FIXED_SAMPLES_FIELD,
                }
            )

    # ---- grouping helpers ----

    def _normalize_donor_id(self, raw_donor_id: str) -> str:
        """get_donor() may return a uuid or an @id depending on frame; resolve
        once per unique value so donor grouping keys are always bare uuids."""
        if raw_donor_id not in self._donor_uuid_cache:
            donor_item = self.request_handler.get_item(raw_donor_id)
            self._donor_uuid_cache[raw_donor_id] = item_utils.get_uuid(donor_item)
        return self._donor_uuid_cache[raw_donor_id]

    def _group_by_donor_and_protocol(
        self, samples: List[Dict[str, Any]]
    ) -> Dict[Tuple[str, str], List[Dict[str, Any]]]:
        groups: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
        for sample in samples:
            protocol_id = tissue_sample_utils.get_protocol_id_from_external_id(
                item_utils.get_external_id(sample)
            )
            if protocol_id not in FRESH_TO_FIXED_PROTOCOL_MAP:
                continue
            raw_donor_ids = tissue_sample_utils.get_donor(self.request_handler, sample)
            if not raw_donor_ids:
                self.add_warning(
                    f"{self._get_identifier_to_report(sample)}: could not resolve donor - skipping."
                )
                continue
            donor_uuid = self._normalize_donor_id(raw_donor_ids[0])
            groups.setdefault((donor_uuid, protocol_id), []).append(sample)
        return groups

    def _index_fixed_samples(
        self, fixed_samples: List[Dict[str, Any]], donor_uuid: Optional[str] = None
    ) -> Dict[Tuple[str, str], List[Dict[str, Any]]]:
        index: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
        for sample in fixed_samples:
            protocol_id = tissue_sample_utils.get_protocol_id_from_external_id(
                item_utils.get_external_id(sample)
            )
            if protocol_id not in FRESH_TO_FIXED_PROTOCOL_MAP.values():
                continue
            if donor_uuid is not None:
                key_donor = donor_uuid
            else:
                raw_donor_ids = tissue_sample_utils.get_donor(self.request_handler, sample)
                if not raw_donor_ids:
                    continue
                key_donor = self._normalize_donor_id(raw_donor_ids[0])
            index.setdefault((key_donor, protocol_id), []).append(sample)
        return index

    def _build_fixed_sample_index_global(self) -> Dict[Tuple[str, str], List[Dict[str, Any]]]:
        search_filter = f"{TPC_SEARCH_FILTER}&preservation_type={FIXED_PRESERVATION_TYPE}"
        fixed_samples = ff_utils.search_metadata(search_filter, key=self.key)
        return self._index_fixed_samples(fixed_samples)

    def _build_fixed_sample_index_for_donors(
        self, donor_uuids: List[str]
    ) -> Dict[Tuple[str, str], List[Dict[str, Any]]]:
        """Scoped runs are typically small, so resolve siblings per donor via
        the donor's own Tissues rather than pulling the entire TPC dataset."""
        index: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
        for donor_uuid in donor_uuids:
            tissue_filter = f"/search/?type=Tissue&donor.uuid={donor_uuid}"
            tissues = ff_utils.search_metadata(tissue_filter, key=self.key)
            if not tissues:
                continue
            for tissue in tissues:
                if not tissue.get("preservation_type"):
                    self.add_warning(
                        f"Tissue {self._get_identifier_to_report(tissue)} (donor {donor_uuid}) "
                        f"has no preservation_type set."
                    )
            sample_filter = f"{TPC_SEARCH_FILTER}&preservation_type={FIXED_PRESERVATION_TYPE}"
            for tissue in tissues:
                sample_filter += f"&sample_sources.uuid={item_utils.get_uuid(tissue)}"
            fixed_samples = ff_utils.search_metadata(sample_filter, key=self.key)
            for key, items in self._index_fixed_samples(fixed_samples, donor_uuid=donor_uuid).items():
                index.setdefault(key, []).extend(items)
        return index

    # ---- shared ----

    def _get_identifier_to_report(self, item: Dict[str, Any]) -> str:
        if submitted_id := item_utils.get_submitted_id(item):
            return submitted_id
        if identifier := item_utils.get_identifier(item):
            return identifier
        return item_utils.get_accession(item)

    def validate_patch(
        self, uuid: str, patch_body: Dict[str, Any], delete_fields: Optional[str]
    ) -> None:
        add_on = "?check_only=true"
        if delete_fields:
            add_on += f"&delete_fields={delete_fields}"
        ff_utils.patch_metadata(patch_body, obj_id=uuid, add_on=add_on, key=self.key)

    def patch_metadata(
        self, uuid: str, patch_body: Dict[str, Any], delete_fields: Optional[str]
    ) -> None:
        add_on = f"?delete_fields={delete_fields}" if delete_fields else ""
        ff_utils.patch_metadata(patch_body, obj_id=uuid, add_on=add_on, key=self.key)

    def execute(self) -> None:
        for op in self.operations:
            self.validate_patch(op["uuid"], op["patch_body"], op["delete_fields"])
        for op in self.operations:
            self.patch_metadata(op["uuid"], op["patch_body"], op["delete_fields"])

    def show_operations(self) -> None:
        pp.pprint(self.operations)

    def add_warning(self, msg: str) -> None:
        self.warnings.append(f"{warning_text('WARNING')} {msg}")

    def print_error_and_exit(self, msg: str) -> None:
        print(fail_text(f"ERROR: {msg} Exiting."))
        exit()


class bcolors:
    HEADER = "\033[95m"
    OKBLUE = "\033[94m"
    OKCYAN = "\033[96m"
    OKGREEN = "\033[92m"
    WARNING = "\033[93m"
    FAIL = "\033[91m"
    ENDC = "\033[0m"
    BOLD = "\033[1m"
    UNDERLINE = "\033[4m"


def ok_blue_text(text: str) -> str:
    return f"{bcolors.OKBLUE}{text}{bcolors.ENDC}"


def ok_green_text(text: str) -> str:
    return f"{bcolors.OKGREEN}{text}{bcolors.ENDC}"


def warning_text(text: str) -> str:
    return f"{bcolors.WARNING}{text}{bcolors.ENDC}"


def fail_text(text: str) -> str:
    return f"{bcolors.FAIL}{text}{bcolors.ENDC}"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Populate or remove linked_fixed_samples on fresh/frozen TissueSamples."
    )
    parser.add_argument("--env", "-e", help="Environment from keys file", required=True)
    parser.add_argument(
        "--dry-run", help="Dry run, show operations but do not execute", action="store_true"
    )
    parser.add_argument(
        "--delete",
        help="Remove linked_fixed_samples instead of populating it, for the selected scope",
        action="store_true",
    )

    scope_group = parser.add_mutually_exclusive_group(required=True)
    scope_group.add_argument(
        "--all", action="store_true", help="Process every GCC-submitted fresh/frozen TissueSample"
    )
    scope_group.add_argument(
        "--search-query",
        help=(
            "Additional search filter appended to the base GCC fresh/frozen search, "
            "e.g. 'linked_fixed_samples=No value'"
        ),
    )
    scope_group.add_argument(
        "--identifiers", nargs="+", help="One or more TissueSample accessions/uuids/submitted_ids"
    )
    scope_group.add_argument(
        "--identifiers-file", help="Path to a file with one identifier per line"
    )

    args = parser.parse_args()

    auth_key = get_auth_key(args.env)
    server = auth_key.get("server")

    if args.all:
        scope, search_query, identifiers = "all", None, None
    elif args.search_query:
        scope, search_query, identifiers = "query", args.search_query, None
    elif args.identifiers_file:
        with open(args.identifiers_file) as fh:
            identifiers = [line.strip() for line in fh if line.strip()]
        scope, search_query = "identifiers", None
    else:
        scope, search_query, identifiers = "identifiers", None, args.identifiers

    associator = FixedSampleAssociator(auth_key=auth_key, dry_run=args.dry_run)
    action = "delete" if args.delete else "populate"
    target_samples = associator.get_target_samples(
        scope, action, search_query=search_query, identifiers=identifiers
    )

    if not target_samples:
        associator.print_error_and_exit(
            "No matching TissueSamples found for the given scope."
        )

    if args.delete:
        associator.compute_and_delete(target_samples)
    else:
        associator.compute_and_patch(target_samples, scope)

    print(f"\nThe following operations were computed for {warning_text(server)}:")
    for info in associator.patch_infos:
        print(info)

    if associator.warnings:
        print(f"\n{warning_text('Please note the following warnings:')}")
        for warning in associator.warnings:
            print(warning)

    if not associator.operations:
        print(ok_green_text("\nNothing to do."))
        return

    if args.dry_run:
        print(f"\n{warning_text('Dry run')} - operations that would be executed:")
        associator.show_operations()
        return

    if args.delete:
        resp = input(
            f"\n{fail_text('This will PERMANENTLY remove ' + LINKED_FIXED_SAMPLES_FIELD)} "
            f"from {len(associator.operations)} sample(s) on {warning_text(server)}."
            f"\nType DELETE (all caps) to proceed, or anything else to abort: "
        )
        if resp != "DELETE":
            print(warning_text("Aborted by user."))
            return
        associator.execute()
        print(ok_green_text("\nDeletion complete."))
        return

    while True:
        resp = input(
            f"\nDo you want to proceed with patching the {len(associator.operations)} "
            f"sample(s) above? Data will be patched on {warning_text(server)}."
            f"\nYou have the following options: "
            f"\ny - Proceed"
            f"\np - Show operations"
            f"\nn - Abort "
            f"\n(y,p,n): "
        )
        if resp in ("y", "yes"):
            associator.execute()
            print(ok_green_text("\nPatching complete."))
            break
        elif resp == "p":
            associator.show_operations()
            continue
        else:
            print(warning_text("Aborted by user."))
            break


if __name__ == "__main__":
    main()
