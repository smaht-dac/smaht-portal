from typing import Any, Dict, List, Union

from . import analyte, file_set, library, sample, tissue
from .utils import RequestHandler, get_unique_values


def get_file_format(properties: Dict[str, Any]) -> str:
    """Get file format from properties."""
    return properties.get("file_format", "")


def get_file_size(properties: Dict[str, Any]) -> Union[int, None]:
    """Get file size from properties."""
    return properties.get("file_size")


def get_md5sum(properties: Dict[str, Any]) -> str:
    """Get md5sum from properties."""
    return properties.get("md5sum", "")


def get_access_status(properties: Dict[str, Any]) -> str:
    """Get access status from properties."""
    return properties.get("access_status", "")


def get_data_category(properties: Dict[str, Any]) -> List[str]:
    """Get data category from properties."""
    return properties.get("data_category", [])


def get_data_type(properties: Dict[str, Any]) -> List[str]:
    """Get data type from properties."""
    return properties.get("data_type", [])


def get_annotated_filename(properties: Dict[str, Any]) -> str:
    """Get annotated filename from properties."""
    return properties.get("annotated_filename", "")


def get_sequencing_center(properties: Dict[str, Any]) -> str:
    """Get sequencing center from properties."""
    return properties.get("sequencing_center", [])


def get_file_sets(properties: Dict[str, Any]) -> List[str]:
    """Get file sets from properties."""
    return properties.get("file_sets", [])


def get_sequencings(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get sequencings associated with file."""
    file_sets = request_handler.get_items(get_file_sets(properties))
    return get_unique_values(file_sets, file_set.get_sequencing)


def get_libraries(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get libraries associated with file."""
    file_sets = request_handler.get_items(get_file_sets(properties))
    return get_unique_values(file_sets, file_set.get_libraries)


def get_assays(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get assays associated with file."""
    libraries = request_handler.get_items(get_libraries(request_handler, properties))
    return get_unique_values(libraries, library.get_assay)


def get_analytes(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get analytes associated with file."""
    libraries = request_handler.get_items(get_libraries(request_handler, properties))
    return get_unique_values(libraries, library.get_analyte)


def get_samples(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get samples associated with file."""
    analytes = request_handler.get_items(get_analytes(request_handler, properties))
    return get_unique_values(analytes, analyte.get_samples)


def get_sample_sources(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get sample sources associated with file."""
    samples = request_handler.get_items(get_samples(request_handler, properties))
    return get_unique_values(samples, sample.get_sample_sources)


def get_tissues(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get tissues associated with file."""
    sample_sources = get_sample_sources(request_handler, properties)
    return [
        sample_source
        for sample_source in sample_sources
        if tissue.is_tissue(request_handler.get_item(sample_source))
    ]


def get_donors(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get donors associated with file."""
    tissues = request_handler.get_items(get_tissues(request_handler, properties))
    return get_unique_values(tissues, tissue.get_donor)
