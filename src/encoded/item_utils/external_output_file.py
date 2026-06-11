from typing import List, Dict, Any, Union

from ..item_utils.utils import (
    RequestHandler,
    dedupe_identifiers,
    get_property_values_from_identifiers,
)
from ..item_utils import (
    item as item_utils,
    tissue as tissue_utils,
    file as file_utils,
    meta_workflow_run as mwfr_utils,
    submitted_file as submitted_file_utils,
)


def is_external_output_file(properties: Dict[str, Any]) -> bool:
    """Check if file is an external output file."""
    return "ExternalOutputFile" in item_utils.get_types(properties)  


def get_tissues(
    properties: Dict[str, Any]
) -> List[str]:
    """Get tissues associated with external output file."""
    return properties.get("tissues", [])


def get_source_donors(
    properties: Dict[str, Any]
) -> List[str]:
    """Get source donors associated with external output file."""
    return properties.get("source_donors", [])


def get_data_description(
    properties: Dict[str, Any]
) -> str:
    """Get data description from file."""
    return properties.get("data_description", "")


def get_donors(
   properties: Dict[str, Any],
   request_handler: RequestHandler
) -> List[str]:
    """Get donors associated with external output file."""
    if (donors := get_source_donors(properties)):
        return donors
    # dedupe_identifiers (not list(set(...))) so a tissue whose @@object
    # returned donor as an embedded dict (instead of a bare linkTo path)
    # doesn't crash this with `unhashable type: 'dict'`.
    return dedupe_identifiers(get_property_values_from_identifiers(
        request_handler, get_tissues(properties), tissue_utils.get_donor
    ))


def get_tissue_category(
    properties: Dict[str, Any],
    request_handler: RequestHandler
) -> List[str]:
    """Get tissue category associated with external output file.
        can be multiple tissues if more than one category return ? multiple"""
    tissue_ids = get_tissues(properties)
    tissues = request_handler.get_items(tissue_ids)
    categories = set()
    for tissue in tissues:
        categories.add(tissue_utils.get_category(tissue, request_handler))
    if len(categories) == 1:
        return list(categories)
    if len(categories) > 1:
        # TODO: is this what we want to do or just return all?
        return ['Multiple']
    return []


def get_tissue_type(
    properties: Dict[str, Any],
    request_handler: RequestHandler
) -> List[str]:
    """Get tissue types associated with external output file.
        can be multiple tissue types if more than one tissue"""
    tissue_ids = get_tissues(properties)
    tissues = request_handler.get_items(tissue_ids)
    types = set()
    for tissue in tissues:
        types.add(tissue_utils.get_tissue_type(tissue, request_handler))
    # TODO: is this what we want to do or return a single value if over some number?
    return list(set(types))



def get_uberon_ids(
    properties: Dict[str, Any],
    request_handler: RequestHandler
) -> List[str]:
    """Get uberon ids associated with external output file."""
    return list(set(get_property_values_from_identifiers(
        request_handler, get_tissues(properties), tissue_utils.get_uberon_id
    )))


def get_mwfr_file_sets_from_derived_from(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[Union[str, Dict[str, Any]]]:
    """Get file_sets from the output meta_workflow_run of the derived_from files associated with file."""
    mwfr = get_property_values_from_identifiers(
        request_handler,
        submitted_file_utils.get_derived_from(properties),
        file_utils.get_meta_workflow_run_outputs,
    )
    return get_property_values_from_identifiers(
        request_handler,
        mwfr,
        mwfr_utils.get_file_sets,
    )
    

def get_mwfr_input_file_sets_from_derived_from(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[Union[str, Dict[str, Any]]]:
    """Get file_sets from input files of the output meta_workflow_run of the derived_from files associated with file."""
    mwfr = get_property_values_from_identifiers(
        request_handler,
        submitted_file_utils.get_derived_from(properties),
        file_utils.get_meta_workflow_run_outputs,
    )
    input_files = get_property_values_from_identifiers(
        request_handler,
        mwfr,
        mwfr_utils.get_files_from_input,
    )
    return get_property_values_from_identifiers(
        request_handler,
        input_files,
        file_utils.get_file_sets,
    )

