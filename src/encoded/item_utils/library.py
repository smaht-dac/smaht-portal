from typing import Any, Dict, List, Optional, Union

from . import analyte as analyte_utils
from .utils import RequestHandler, get_property_values_from_identifiers


def get_assay(library: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get assay connected to library."""
    return library.get("assay", "")


def get_analyte(library: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get analyte connected to library."""
    return library.get("analyte", "")


def get_samples(
    library: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[str]:
    """Get samples connected to library."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler, get_analyte(library), analyte_utils.get_samples
        )
    return []
