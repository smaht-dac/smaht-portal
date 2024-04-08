from typing import Any, Dict, List, Optional, Union

from . import analyte, file_set, library, sample, sequencing, tissue
from .utils import (
    RequestHandler,
    get_property_values_from_identifiers,
    get_unique_values,
)


def get_file_format(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
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


def get_sequencing_center(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get sequencing center from properties."""
    return properties.get("sequencing_center", "")


def get_software(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get software from properties."""
    return properties.get("software", [])


def get_reference_genome(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get reference genome from properties."""
    return properties.get("reference_genome", "")


def get_file_sets(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get file sets from properties."""
    return properties.get("file_sets", [])


def get_sequencings(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get sequencings associated with file."""
    if request_handler:
        file_sets = request_handler.get_items(get_file_sets(properties))
        return get_unique_values(file_sets, file_set.get_sequencing)
    return properties.get("sequencing", [])


def get_sequencers(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[str]:
    """Get sequencers associated with file."""
    sequencings = get_sequencings(properties, request_handler)
    return get_property_values_from_identifiers(
        request_handler, sequencings, sequencing.get_sequencer
    )


def get_libraries(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get libraries associated with file."""
    if request_handler:
        file_sets = request_handler.get_items(get_file_sets(properties))
        return get_unique_values(file_sets, file_set.get_libraries)
    return properties.get("libraries", [])


def get_assays(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get assays associated with file."""
    if request_handler:
        libraries = request_handler.get_items(
            get_libraries(properties, request_handler)
        )
        return get_unique_values(libraries, library.get_assay)
    return properties.get("assays", [])


def get_analytes(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get analytes associated with file."""
    if request_handler:
        libraries = request_handler.get_items(
            get_libraries(properties, request_handler)
        )
        return get_unique_values(libraries, library.get_analyte)
    return properties.get("analytes", [])


def get_samples(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get samples associated with file."""
    if request_handler:
        analytes = request_handler.get_items(get_analytes(properties, request_handler))
        return get_unique_values(analytes, analyte.get_samples)
    return properties.get("samples", [])


def get_sample_sources(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get sample sources associated with file."""
    if request_handler:
        samples = request_handler.get_items(get_samples(properties, request_handler))
        return get_unique_values(samples, sample.get_sample_sources)
    return properties.get("sample_sources", [])


def get_tissues(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get tissues associated with file."""
    if request_handler:
        sample_sources = get_sample_sources(properties, request_handler)
        return [
            sample_source
            for sample_source in sample_sources
            if tissue.is_tissue(request_handler.get_item(sample_source))
        ]
    return properties.get("tissues", [])


def get_donors(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get donors associated with file."""
    if request_handler:
        tissues = request_handler.get_items(get_tissues(properties, request_handler))
        return get_unique_values(tissues, tissue.get_donor)
    return properties.get("donors", [])


def get_file_summary(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Get file summary from properties."""
    return properties.get("file_summary", {})


def get_data_generation_summary(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Get data generation summary from properties."""
    return properties.get("data_generation_summary", {})


def get_sample_summary(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Get sample summary from properties."""
    return properties.get("sample_summary", {})


def get_analysis_summary(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Get analysis summary from properties."""
    return properties.get("analysis_summary", {})
