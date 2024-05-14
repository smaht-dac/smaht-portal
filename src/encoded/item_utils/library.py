from typing import Any, Dict, List, Union

from . import analyte as analyte_utils
from .utils import RequestHandler


def get_assay(library: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get assay connected to library."""
    return library.get("assay", "")


def get_analyte(library: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get analyte connected to library."""
    return library.get("analyte", "")


def get_samples(request_handler: RequestHandler, library: Dict[str, Any]) -> List[str]:
    """Get samples connected to library."""
    if request_handler:
        analyte = request_handler.get_item(get_analyte(library))
        return analyte_utils.get_samples(analyte)
    return []
