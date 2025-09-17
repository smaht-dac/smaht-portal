from typing import Dict, List, Any, Optional
import pandas as pd
import argparse
import structlog
from pathlib import Path

from encoded.commands.utils import get_auth_key
from encoded.item_utils.utils import (
    RequestHandler
)
from encoded.item_utils import (
    item as item_utils,
    donor as donor_utils,
    medical_history as mh_utils,
)
from dcicutils import ff_utils

log = structlog.getLogger(__name__)

"""
Bulk Donor Manifest Generator
=============================

This script retrieves donor metadata from the portal and generates a bulk
donor manifest in TSV format. The manifest can be tailored using donor
identifiers, a donor search query, or (if neither is provided) a default
search. 

Only TPC-submitted Benchmarking and Production donors are included in the
output, even if other donors are supplied via search or identifiers.

By default, the manifest includes protected donor properties. Use the
--public/p flag to restrict the output to public donor properties only.

Usage
-----
    python create_bulk_donor_manifest.py --env <environment> --output <output_file> [options]

Required Arguments
------------------
    --env, -e
        Environment name from your .smaht_keys.json file (e.g. data, devtest).
    --output, -o
        Path to the output TSV file that will contain the bulk donor manifest.

Optional Arguments
------------------
    --search, -s
        A search query string for retrieving donors, e.g.
        "search/?type=Donor&study=Benchmarking".
        Can be combined with --donors, or omitted to use the default search.
    --donors, -d
        A list of donor accession IDs or UUIDs (space-separated).
        Can be combined with --search, or omitted to use the default search.

    NOTE: If both --search and --donors are provided, donors from both
    sources are included. If only --donors is provided, only those donors are
    used and the default search is ignored.


    --public, -p
        Generate a manifest containing only **public donor properties**
        (derived from the "Donor" item type).
        Mutually exclusive with --restricted.

    --restricted, -r
        Generate a manifest containing **Donors with the status 'restricted'**
        Mutually exclusive with --public.
        WARNING: This option has no effect when --search or --donors are
        provided, since those explicitly control which donors are included.

Behavior
--------
    * If both --search and --donors are provided, donors from both are included.
    * If only one of --search or --donors is provided, that source is used.
    * If neither is provided, a default search query is constructed:
    * The --public option restricts the manifest to public donor properties only,
        however, if a search or donor IDs are provided the public metadata for those
        donors will be added to the manifest regardless of the status of those donors.

Output
------
    The output is a tab-separated values (TSV) file containing donor metadata,
    with columns determined by the selected mode (public vs restricted).
    Some property names are adjusted for clarity (e.g.,
    "MedicalHistory.height" becomes "MedicalHistory.height_m").

Examples
--------
    # Generate a manifest containing protected data from the default Benchmarking/Production search
    create_bulk_donor_manifest.py -e data -o donors.tsv

    # Generate a public manifest for devtest from 2 specific donors using IDs
    create_bulk_donor_manifest.py -e devtest -o donors.tsv -p -d SMADOZMJG4G1 SMADOQLTKYL4

    # Generate a manifest that includes donors with status=restricted
    create_bulk_donor_manifest.py --env data --output donors.tsv --restricted

    # Generate a manifest from a specific search query
    create_bulk_donor_manifest.py --env data --output donors.tsv --search "search/?type=ProtectedDonor&study=Benchmarking"
    WARNING: if creating a protected manifest from a specific search query searching for ProtectedDonor is recommended
    to avoid exceptions caused by Donors not linked to ProtectedDonor items.
"""


DEFAULT_STATUS = "public-restricted"
PUBLIC_STATUS = "public"
RESTRICTED_STATUS = "restricted"
DEFAULT_SEARCH_STEM = "search/?study=Benchmarking&study=Production"
PUBLIC_ITEM_TYPES = ["Donor"]  # Top level item must be first - i.e. Donor
PROTECTED_ITEM_TYPES = [  # Top level item must be first - i.e. ProtectedDonor
    "ProtectedDonor",
    "Demographic",
    "DeathCircumstances",
    "MedicalHistory",
    "TissueCollection",
    "FamilyHistory",
    "MedicalTreatment",
    "Diagnosis",
    "Exposure"
]

IGNORED_PROPERTIES = [
    "accession",
    "alternate_accessions",
    "consortia",
    "date_created",
    "eligibility",
    "last_modified",
    "protocols",
    "schema_version",
    "status",
    "submission_centers",
    "submitted_by",
    "submitted_id",
    "tags",
    "tpc_submitted",
    "uuid",
]

CHANGED_COLUMNS = {
    "DeathCircumstances.death_pronounced_interval": "DeathCircumstances.death_pronounced_interval_h",
    "DeathCircumstances.ventilator_time": "DeathCircumstances.ventilator_time_h",
    "MedicalHistory.height": "MedicalHistory.height_m",
    "MedicalHistory.weight": "MedicalHistory.weight_kg",
    "TissueCollection.ischemic_time": "TissueCollection.ischemic_time_h",
    "TissueCollection.recovery_interval": "TissueCollection.recovery_interval_min",
    "TissueCollection.refrigeration_prior_to_procurement_time": "TissueCollection.refrigeration_prior_to_procurement_time_h",
    "Exposure.cessation_duration": "Exposure.cessation_duration_y",
    "Exposure.duration": "Exposure.duration_y",
}


def create_bulk_donor_manifest(
    output: str,
    auth_key: Dict[str, str],
    search: Optional[str] = None,
    identifiers: Optional[List[str]] = None,
    public: bool = False,
) -> None:
    """Create bulk donor manifest file for given donors."""

    request_handler = RequestHandler(auth_key=auth_key)
    # import pdb; pdb.set_trace()
    donors = get_donors(request_handler, search, identifiers)
    log.info(f"Found {len(donors)} Benchmarking and Production donors to process")
    schemas = ff_utils.get_schemas(key=auth_key)
    log.info("Generating bulk donor manifest")
    bulk_donor_manifest = get_bulk_donor_manifest(donors, schemas, request_handler, public)
    log.info(f"Writing out bulk donor manifest to {output}")
    write_bulk_donor_manifest(bulk_donor_manifest, output)


def get_donors(
    request_handler: RequestHandler,
    search: Optional[str] = None,
    identifiers: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Get donor items from given search query and idenitfiers."""
    auth_key = request_handler.auth_key
    donors = []
    if search:
        donors += get_donors_from_search(search, auth_key)
    if identifiers:
        donors += get_donors_from_identifiers(identifiers, request_handler)
    # remove duplicates
    return list({d["uuid"]: d for d in donors}.values())


def get_donors_from_search(search_query: str, auth_key: Dict[str, str]) -> List[str]:
    """Get donor items from given search query."""
    if search_query:
        donors = get_items_from_search_query(search_query, auth_key)
        return filter_donors(donors)
    return []


def get_items_from_search_query(
    search_query: str, auth_key: Dict[str, str]
) -> List[str]:
    """Get items from given search query."""
    try:
        result = ff_utils.search_metadata(search_query, key=auth_key)
    except Exception as e:
        log.error(f"Error searching for items: {e}")
        result = []
    return result


def filter_donors(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Get Benchmarking and Productino donors from given items."""
    return [item for item in items if donor_utils.is_abstract_donor(item) and donor_utils.get_study(item)]


def get_donors_from_identifiers(
    identifiers: List[str], request_handler: RequestHandler
) -> List[str]:
    """Get donors items from given identifiers."""
    items = request_handler.get_items(identifiers)
    return filter_donors(items)


def get_bulk_donor_manifest(
        donors: List[Dict[str, Any]],
        schemas: Dict[str, Any],
        request_handler: RequestHandler,
        public: bool = False
) -> pd.DataFrame:
    """Generate dataframe of bulk donor manifest from list of donors."""
    kept_properties = get_kept_properties(schemas, public)
    donor_manifest = pd.DataFrame(columns=kept_properties)
    external_ids = [item_utils.get_external_id(donor) for donor in donors]
    medical_histories = get_medical_histories(external_ids, request_handler)
    for idx, donor in enumerate(donors):
        medical_history = medical_histories[idx]
        donor_manifest = generate_manifest_row(
            donor_manifest, idx, donor, medical_history, kept_properties, request_handler, public
        )
    return donor_manifest


def get_kept_properties(schemas: Dict[str, Any], public: bool = False) -> List[str]:
    """Get properties that are included in the bulk manifest from the schema."""
    all_kept_properties = []
    # import pdb; pdb.set_trace()
    item_types = PROTECTED_ITEM_TYPES
    if public:
        item_types = PUBLIC_ITEM_TYPES
    for item_type in item_types:
        kept_properties = []
        if item_type == PUBLIC_ITEM_TYPES[0] or item_type == PROTECTED_ITEM_TYPES[0]:
            kept_properties += [f"{item_type}.accession"]
        kept_properties += [
            f"{item_type}.{prop}"
            for prop in schemas[item_type]['properties'].keys()
            if prop not in IGNORED_PROPERTIES
            and 'calculatedProperty' not in schemas[item_type]['properties'][prop]
            and 'linkTo' not in schemas[item_type]['properties'][prop]
        ]
        all_kept_properties += kept_properties
    modified_properties = [
        CHANGED_COLUMNS[prop] if prop in CHANGED_COLUMNS.keys()
        else prop for prop in all_kept_properties]
    return modified_properties


def get_medical_histories(
        external_ids: List[str],
        request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get medical history list from protected donors."""
    search_query = "search/?type=MedicalHistory&frame=embedded"
    for external_id in external_ids:
        search_query += f"&donor={external_id}"
    mh_list = ff_utils.search_metadata(search_query, key=request_handler.auth_key)
    return order_items_by_donor(mh_list, external_ids)


def order_items_by_donor(items: List[Dict[str, Any]], donor_order: List[str]):
    """Reorder list of item properties to match donor order."""
    new_items = []
    for id in donor_order:
        for item in items:
            if item_utils.get_display_title(
                mh_utils.get_donor(item)
            ) == id:
                new_items.append(item)
    return new_items


def generate_manifest_row(
        donor_manifest: pd.DataFrame,
        idx: int,
        donor: str,
        medical_history: Dict[str, Any],
        kept_properties: List[str],
        request_handler: RequestHandler,
        public: bool = False
):
    """Generate row for manifest."""
    donor_type = "ProtectedDonor"
    if public:
        donor_type = "Donor"
    donor_external_id = item_utils.get_external_id(donor)
    mh_submitted_id = item_utils.get_submitted_id(medical_history)
    donor_search_dict = {
        "Demographic": f"search/?type=Demographic&donor={donor_external_id}&frame=raw",
        "DeathCircumstances": f"search/?type=DeathCircumstances&donor={donor_external_id}&frame=raw",
        "TissueCollection": f"search/?type=TissueCollection&donor={donor_external_id}&frame=raw",
        "FamilyHistory": f"search/?type=FamilyHistory&donor={donor_external_id}&frame=raw",
    }
    mh_search_dict = {
        "Exposure": f"search/?type=Exposure&medical_history={mh_submitted_id}&frame=raw",
        "Diagnosis": f"search/?type=Diagnosis&medical_history={mh_submitted_id}&frame=raw",
        "MedicalTreatment": f"search/?type=MedicalTreatment&medical_history={mh_submitted_id}&frame=raw",
    }
    donor_manifest = add_row_from_item(donor_manifest, idx, donor_type, [donor], kept_properties)
    donor_manifest = add_row_from_item(donor_manifest, idx, "MedicalHistory", [medical_history], kept_properties)
    donor_manifest = add_row_from_search(donor_manifest, idx, donor_search_dict, kept_properties, request_handler)
    donor_manifest = add_row_from_search(donor_manifest, idx, mh_search_dict, kept_properties, request_handler)
    return donor_manifest


def add_row_from_item(
    donor_manifest: pd.DataFrame,
    idx: int,
    item_type: str,
    items: List[Dict[str, Any]],
    kept_properties: List[str]
):
    """Add row to dataframe from item properties."""
    return format_value_from_properties(donor_manifest, idx, item_type, kept_properties, items)


def add_row_from_search(
    donor_manifest: pd.DataFrame,
    idx: int,
    search_dict: Dict[str, Any],
    kept_properties: List[str],
    request_handler: RequestHandler
) -> pd.DataFrame:
    """Add row to dataframe from portal search."""
    tmp_dataframe = donor_manifest
    for item_type, search in search_dict.items():
        hits = ff_utils.search_metadata(search, key=request_handler.auth_key)
        tmp_dataframe = format_value_from_properties(tmp_dataframe, idx, item_type, kept_properties, hits)
    return donor_manifest


def format_value_from_properties(
    donor_manifest: pd.DataFrame,
    idx: int,
    item_type: str,
    kept_properties: List[str],
    results: Dict[str, Any],
):
    """Format and fill in dataframe columns from item properties."""
    subcolumns = [column.split(".")[1] for column in kept_properties if column.split(".")[0] == item_type]
    if len(results) > 1:  # multiple items returned from search
        for sub in subcolumns:
            col = f"{item_type}.{sub}"
            if col in CHANGED_COLUMNS.keys():
                col = CHANGED_COLUMNS[col]
            values = []
            for hit in results:
                if sub in hit:
                    value = hit[sub]
                    if type(value) is list:
                        value = ";".join(value)
                    if value or value == 0:
                        values.append(str(value))
                    else:
                        values.append("NA")
                else:
                    values.append("NA")
            donor_manifest.at[idx, col] = "|".join(values)
    elif len(results) == 1:
        for sub in subcolumns:
            col = f"{item_type}.{sub}"
            if col in CHANGED_COLUMNS.keys():
                col = CHANGED_COLUMNS[col]
            if sub in results[0]:
                value = results[0][sub]
                if type(value) is list:
                    value = ";".join(value)
                if value or value == 0:
                    donor_manifest.at[idx, col] = value
                else:
                    donor_manifest.at[idx, col] = "NA"
            else:
                donor_manifest.at[idx, col] = "NA"
    else:
        for sub in subcolumns:
            col = f"{item_type}.{sub}"
            if col in CHANGED_COLUMNS.keys():
                col = CHANGED_COLUMNS[col]
            donor_manifest.at[idx, col] = "NA"
    return donor_manifest


def write_bulk_donor_manifest(
    donor_manifest: pd.DataFrame,
    output: Path
) -> None:
    """Write out TSV containing the bulk donor manifest to output file."""
    donor_manifest.to_csv(output, sep='\t', index=False)
    log.info(f"Workbook written to: {output}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--search",
        "-s",
        help="Search query for donors to create bulk donor manifest - format search/?type=Donor",
    )
    parser.add_argument(
        "--donors",
        "-d",
        nargs="*",
        help="Donor identifiers to create bulk donor manifest",
    )
    parser.add_argument(
        "--env",
        "-e",
        help="Environment from keys file",
        required=True
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output file name",
        required=True
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--public",
        "-p",
        action="store_true",
        default=False,
        help="Create public manifest (only public donor properties)",
    )
    group.add_argument(
        "--restricted",
        "-r",
        action="store_true",
        default=False,
        help="Create restricted manifest (includes restricted donors) WARNING: Has no effect when --search or --donors are provided."
    )
    args = parser.parse_args()
    auth_key = get_auth_key(args.env)
    # support providing both search and donors, but if only one is provided
    # use that preferentially and if neither use default search based on public or not
    if args.restricted and (args.search or args.donors):
        log.warning("WARNING: --restricted has no effect when --search or --donors are provided.")
    if args.donors:
        if not args.search:
            search_query = None
    elif not args.search:
        # default to default search based on public or not
        search_query = DEFAULT_SEARCH_STEM
        if args.public:
            search_query += f"&type={PUBLIC_ITEM_TYPES[0]}&status={PUBLIC_STATUS}"
        else:
            search_query += f"&type={PROTECTED_ITEM_TYPES[0]}&status={DEFAULT_STATUS}"
            if args.restricted:
                search_query += f"&status={RESTRICTED_STATUS}"
        log.info(f"Using default search {search_query} to get donors")
    else:
        search_query = args.search
    # import pdb; pdb.set_trace()
    create_bulk_donor_manifest(
        args.output,
        auth_key,
        search_query,
        args.donors,
        args.public,
    )


if __name__ == "__main__":
    main()
