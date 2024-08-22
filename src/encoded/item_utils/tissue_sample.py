from typing import Any, Dict, List, Optional, Union

from ..item_utils.utils import RequestHandler,  get_property_values_from_identifiers
from ..item_utils import (
    sample as sample_utils,
    item as item_utils
)


def get_category(properties: Dict[str, Any]) -> str:
    """Get category from properties."""
    return properties.get("category", "")


def is_homogenate(properties: Dict[str, Any]) -> bool:
    return get_category(properties) == "Homogenate"


def get_tissue_submission_centers(properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None) -> List[Union[None, str]]:
    """Get submission_centers of sample_sources tissue from properties."""
    tissues = sample_utils.get_tissues(properties)
    if request_handler:
        submission_centers = []
        for tissue in tissues:
            center = item_utils.get_submission_centers(request_handler.get_item(tissue))
            submission_centers.append(center) if center not in submission_centers else submission_centers
    return []