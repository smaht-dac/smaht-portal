from typing import List, Dict, Any

from ..item_utils.utils import (
    RequestHandler,
    get_property_values_from_identifiers
)
from ..item_utils import (
    item as item_utils,
    tissue as tissue_utils
)


def is_external_output_file(properties: Dict[str, Any]) -> bool:
    """Check if file is an external output file."""
    return "ExternalOutputFile" in item_utils.get_types(properties)  


def get_tissues(
    properties: Dict[str, Any]
) -> List[str]:
    """Get tissues associated with external output file."""
    return properties.get("tissues", [])


def get_donors(
   properties: Dict[str, Any],
   request_handler: RequestHandler
) -> List[str]:
    """Get donors associated with external output file."""
    return list(set(get_property_values_from_identifiers(
        request_handler, get_tissues(properties), tissue_utils.get_donor
    )))


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
        types.add(tissue_utils.get_category(tissue, request_handler))
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

