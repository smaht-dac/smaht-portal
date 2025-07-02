from functools import partial
from typing import Any, Dict, List, Optional, Union

from . import analyte as analyte_utils, sample as sample_utils
from .utils import RequestHandler, get_property_values_from_identifiers


def get_assay(library: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get assay connected to library."""
    return library.get("assay", "")


def get_analytes(library: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get analytes connected to library."""
    return library.get("analytes", [])


def get_library_preparation(library: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get library preparation connected to library."""
    return library.get("library_preparation", "")


def get_all_samples(
    library: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[str]:
    """Get all samples (including parent_samples) connected to library."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_analytes(library),
            partial(analyte_utils.get_all_samples, request_handler),
        )
    return []


def get_samples(
    library: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[str]:
    """Get samples (excluding parent_samples) connected to library."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_analytes(library),
            analyte_utils.get_samples,
        )
    return []


def get_sample_sources(
    library: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[str]:
    """Get sample sources connected to library."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_all_samples(library, request_handler=request_handler),
            sample_utils.get_sample_sources,
        )
    return []
