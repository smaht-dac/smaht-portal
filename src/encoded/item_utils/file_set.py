from typing import Any, Dict, List

from .analyte import get_samples
from .library import get_assay, get_analyte
from .utils import get_unique_values, RequestHandler


def get_sequencing_ids(
    request_handler: RequestHandler, file_sets: List[str]
) -> List[str]:
    """Get sequencing items connected to file sets."""
    file_sets = request_handler.get_items(file_sets)
    return get_unique_values(file_sets, get_sequencing)


def get_sequencing(file_set: Dict[str, Any]) -> str:
    """Get sequencing item connected to file set."""
    return file_set.get("sequencing", "")


def get_assay_ids(
    request_handler: RequestHandler, file_sets: List[str]
) -> List[str]:
    """Get assays connected to file sets."""
    libraries = get_library_items(request_handler, file_sets)
    return get_unique_values(libraries, get_assay)


def get_library_items(
    request_handler: RequestHandler, file_sets: List[str]
) -> List[Dict[str, Any]]:
    """Get libraries connected to file sets."""
    library_ids = get_libary_ids(request_handler, file_sets)
    return request_handler.get_items(library_ids)


def get_libary_ids(
    request_handler: RequestHandler, file_sets: List[str]
) -> List[str]:
    """Get libraries connected to file sets."""
    file_sets = request_handler.get_items(file_sets)
    return get_unique_values(file_sets, get_libraries)


def get_libraries(file_set: Dict[str, Any]) -> List[str]:
    """Get libraries connected to file set."""
    return file_set.get("libraries", [])


def get_analyte_items(
    request_handler: RequestHandler, file_sets: List[str]
) -> List[Dict[str, Any]]:
    """Get analytes connected to file sets."""
    analyte_ids = get_analyte_ids(request_handler, file_sets)
    return request_handler.get_items(analyte_ids)


def get_analyte_ids(
    request_handler: RequestHandler, file_sets: List[str]
) -> List[str]:
    """Get analytes connected to file sets."""
    libraries = get_library_items(request_handler, file_sets)
    return get_unique_values(libraries, get_analyte)


def get_sample_ids(
    request_handler: RequestHandler, file_sets: List[str]
) -> List[str]:
    """Get samples connected to file sets."""
    analytes = get_analyte_items(request_handler, file_sets)
    return get_unique_values(analytes, get_samples)


def get_tissue_ids(
    request_handler: RequestHandler, file_sets: List[str]
) -> List[str]:
    """Get tissues connected to file sets."""
    return []


def get_donor_ids(
    request_handler: RequestHandler, file_sets: List[str]
) -> List[str]:
    """Get donors connected to file sets."""
    return []
