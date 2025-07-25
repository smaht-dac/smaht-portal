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

ITEM_TYPES = [
    "Donor",
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
    "uuid",
    "tags",
    "submitted_id",
    "date_created",
    "submitted_by",
    "status",
    "schema_version",
    "last_modified",
    "submission_centers",
    "consortia",
    "alternate_accessions",
    "protocols"
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
    search: str,
    output: str,
    auth_key: Dict[str, str],
    identifiers: Optional[List[str]] = None,
) -> None:
    """Create bulk donor manifest file for given donors."""

    request_handler = RequestHandler(auth_key=auth_key)
    donors = get_donors(search, request_handler, identifiers)
    log.info(f"Found {len(donors)} donors to process")
    schemas = ff_utils.get_schemas(key=auth_key)
    log.info("Generated bulk donor manifest")
    bulk_donor_manifest = get_bulk_donor_manifest(donors, schemas, request_handler)
    log.info(f"Writing out bulk donor manifest to {output}")
    write_bulk_donor_manifest(bulk_donor_manifest, output)

def get_donors(
    search: str,
    request_handler: RequestHandler,
    identifiers: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Get donor items from given search query and idenitfiers."""
    if identifiers:
        return get_donors_from_search(
            search, request_handler.auth_key
        ) + get_donors_from_identifiers(identifiers, request_handler)
    return get_donors_from_search(
            search, request_handler.auth_key
        )

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
    """Get donors from given items."""
    return [item for item in items if donor_utils.is_donor(item)]


def get_donors_from_identifiers(
    identifiers: List[str], request_handler: RequestHandler
) -> List[str]:
    """Get donors items from given identifiers."""
    items = request_handler.get_items(identifiers)
    return filter_donors(items)


def get_bulk_donor_manifest(
        donors: List[Dict[str, Any]],
        schemas: Dict[str, Any],
        request_handler: RequestHandler
    ) -> pd.DataFrame:
        """Generate dataframe of bulk donor manifest from list of donors."""
        kept_properties = get_kept_properties(schemas)
        donor_manifest = pd.DataFrame(columns=kept_properties)
        external_ids = [item_utils.get_external_id(donor) for donor in donors]
        medical_histories = get_medical_histories(external_ids, request_handler)
        for idx, donor in enumerate(donors):
            medical_history = medical_histories[idx]
            donor_manifest = generate_manifest_row(
                donor_manifest, idx, donor, medical_history, kept_properties, request_handler
            )
        return donor_manifest


def get_kept_properties(schemas: Dict[str, Any]) -> List[str]:
    """Get properties that are included in the bulk manifest from the schema."""
    all_kept_properties = []
    for item_type in ITEM_TYPES:
        kept_properties = []
        if item_type == "Donor":
            kept_properties+= [f"{item_type}.accession"]
        kept_properties  += [f"{item_type}.{prop}" for prop in schemas[item_type]['properties'].keys() if prop not in IGNORED_PROPERTIES and 'calculatedProperty' not in schemas[item_type]['properties'][prop] and 'linkTo' not in schemas[item_type]['properties'][prop]]
        all_kept_properties+=kept_properties
    modified_properties = [CHANGED_COLUMNS[prop] if prop in CHANGED_COLUMNS.keys() else prop for prop in all_kept_properties ]
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
        request_handler: RequestHandler
    ):
    """Generate row for manifest."""
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
    donor_manifest = add_row_from_item(donor_manifest, idx, "Donor", [donor], kept_properties)
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
    if len(results) > 1: # multiple items returned from search
        for sub in subcolumns:
            col = f"{item_type}.{sub}"
            if col in CHANGED_COLUMNS.keys():
                col = CHANGED_COLUMNS[col]
            values = []
            for hit in results:
                if sub in hit:
                    value = hit[sub]
                    if type(value) is list:
                        value=";".join(value)
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
                        value=";".join(value)
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
    donor_manifest.to_csv(output,sep='\t',index=False)
    log.info(f"Workbook written to: {output}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--search",
        "-s",
        help="Search query for donors to create bulk donor manifest",
        default="",
    )
    parser.add_argument(
        "--donors",
        "-d",
        nargs="*",
        help="Donor identifiers to create bulk donor manifest",
        default=[],
    )
    parser.add_argument(
        "--env",
        "-e",
        help="Environment from keys file",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output file name",
    )
    args = parser.parse_args()
    auth_key = get_auth_key(args.env)
    if not args.search and not args.donors:
        log.error("Must provide either --search or --identifiers")
    else:
        create_bulk_donor_manifest(
            args.search,
            args.output,
            auth_key,
            args.donors,
        )


if __name__ == "__main__":
    main()