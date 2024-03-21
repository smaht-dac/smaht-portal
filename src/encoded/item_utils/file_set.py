from typing import Any, Dict, List

# from . import analyte, library, sample, tissue
# from .utils import get_unique_values, RequestHandler


def get_sequencing(properties: Dict[str, Any]) -> str:
    """Get sequencing connected to file set."""
    return properties.get("sequencing", "")


def get_libraries(file_set: Dict[str, Any]) -> List[str]:
    """Get libraries connected to file set."""
    return file_set.get("libraries", [])


# def get_assays(
#     request_handler: RequestHandler, properties: Dict[str, Any]
# ) -> List[str]:
#     """Get assays connected to file set."""
#     libraries = request_handler.get_items(get_libraries(properties))
#     return get_unique_values(libraries, library.get_assay)
# 
# 
# def get_analytes(
#     request_handler: RequestHandler, properties: Dict[str, Any]
# ) -> List[str]:
#     """Get analytes connected to file set."""
#     libraries = request_handler.get_items(get_libraries(properties))
#     return get_unique_values(libraries, library.get_analyte)
# 
# 
# def get_samples(
#     request_handler: RequestHandler, properties: Dict[str, Any]
# ) -> List[str]:
#     """Get samples connected to file set."""
#     analytes = request_handler.get_items(get_analytes(request_handler, properties))
#     return get_unique_values(analytes, analyte.get_samples)
# 
# 
# def get_sample_sources(
#     re
# def get_tissues(
#     request_handler: RequestHandler, properties: Dict[str, Any]
# ) -> List[str]:
#     """Get tissues connected to file set."""
#     samples = request_handler.get_items(get_samples(request_handler, properties))
#     return get_unique_values(samples, sample.get_tissues)
# 
# 
# def get_donors(
#     request_handler: RequestHandler, properties: Dict[str, Any]
# ) -> List[str]:
#     """Get donors connected to file set."""
#     tissues = request_handler.get_items(get_tissues(request_handler, properties))
#     return get_unique_values(tissues, tissue.get_donor)
