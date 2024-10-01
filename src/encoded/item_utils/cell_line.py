from typing import Any, Dict, Union, List
import functools

from .utils import RequestHandler, get_property_values_from_identifiers
from ..item_utils import (
    tissue_sample as tissue_sample_utils,
    item as item_utils
)


def get_donor(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get donor from cell culture."""
    return properties.get("donor", "")


def get_source_donor(request_handler: RequestHandler, properties: Dict[str, Any]) -> Union[str, None]:
    """Get donor from cell line.
    
    Returns donor from properties, tissue_samples, or recursively through parent_cell_lines if present."""
    if "donor" in properties:
        return properties.get("donor", "")
    elif "tissue_samples" in properties:
        result = get_property_values_from_identifiers(
            request_handler,
            get_tissue_samples(properties),
            functools.partial(tissue_sample_utils.get_donor, request_handler)
        )
        return [donor for donor in set(result)][0]
    elif "parent_cell_lines" in properties:
        result = get_property_values_from_identifiers(
            request_handler,
            get_parent_cell_lines(properties),
            functools.partial(get_source_donor, request_handler)
        )
        return [donor for donor in set(result)][0]
    else:
        return None
    


def get_parent_cell_lines(properties: Dict[str, Any]) -> Union[List[str], None]:
    """Get parent_cell_lines from properties."""
    return properties.get("parent_cell_lines",[])


def get_tissue_samples(properties: Dict[str, Any]) -> Union[List[str], None]:
    """Get tissue_samples from properties."""
    return properties.get("tissue_samples",[])


def get_all_parent_cell_lines(request_handler: RequestHandler, properties: Dict[str, Any]) -> List[str]:
    """Get all parent_cell_lines recursively from properties."""
    parent_cell_lines = get_parent_cell_lines(properties)
    to_get = set(
        get_property_values_from_identifiers(
            request_handler, parent_cell_lines, item_utils.get_at_id
        )
    )
    seen = set()
    while to_get:
        uuid = to_get.pop()
        if uuid in seen:
            continue
        seen.add(uuid)
        to_get.update(
            get_property_values_from_identifiers(
                request_handler,
                get_parent_cell_lines(request_handler.get_item(uuid)),
                item_utils.get_uuid,
            )
        )
    return list(seen)
