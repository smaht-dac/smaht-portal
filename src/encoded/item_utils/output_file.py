from functools import partial
from typing import Any, Dict, List, Union
from .item import get_type

from .utils import (
    RequestHandler,
    get_property_values_from_identifiers,
)

from . import (
    item as item_utils,
    tissue as tissue_utils,
    analysis_run as analysis_run_utils,
)


def is_output_file(properties: Dict[str, Any]) -> bool:
    return get_type(properties) == "OutputFile"


def get_output_status(properties: Dict[str, Any]) -> str:
    """Get output status from properties."""
    return properties.get("output_status", "")


def is_final_output(properties: Dict[str, Any]) -> bool:
    """Check if file is final output."""
    return get_output_status(properties) == "Final Output"


def is_final_output_bam(properties: Dict[str, Any]) -> bool:
    file_format = properties.get("file_format", {})
    return is_final_output(properties) and file_format.get("display_title", "") == "bam"


def is_final_output_cram(properties: Dict[str, Any]) -> bool:
    file_format = properties.get("file_format", {})
    return is_final_output(properties) and file_format.get("display_title", "") == "cram"


def get_donors_from_analysis_runs(
        analysis_runs: List[str],
        request_handler: RequestHandler
) -> Union[List[str], None]:
    """Get donors from analysis runs."""
    result = get_property_values_from_identifiers(
        request_handler,
        analysis_runs,
        partial(analysis_run_utils.get_donors, request_handler=request_handler)
    )
    return result or []


def get_sample_sources_from_analysis_runs(
        analysis_runs: List[str],
        request_handler: RequestHandler,
) -> Union[List[str], None]:
    """Get sample sources from analysis runs."""
    result = get_property_values_from_identifiers(
        request_handler,
        analysis_runs,
        partial(analysis_run_utils.get_tissues)
    )
    return result or None


def get_tissue_category(
    properties: Dict[str, Any],
    request_handler: RequestHandler
) -> List[str]:
    """Get tissue category associated with associated items.
        can be multiple tissues if more than one category return ? multiple"""
    tissues = get_sample_sources_from_analysis_runs(
        properties.get("analysis_runs", []),
        request_handler
    )
    categories = set()
    for tissue in tissues:
        tissue_item = request_handler.get_item(tissue)
        category = tissue_item.get("category")
        if category:
            categories.add(category)
    return list(categories)


def get_tissue_type(
    properties: Dict[str, Any],
    request_handler: RequestHandler
) -> List[str]:
    """Get tissue types associated with associated items.
        can be multiple tissue types if more than one tissue"""
    tissues = get_sample_sources_from_analysis_runs(
        properties.get("analysis_runs", []),
        request_handler
    )
    types = set()
    for tissue in tissues:
        tissue_item = request_handler.get_item(tissue)
        types.add(tissue_utils.get_tissue_type(tissue_item, request_handler))
    # TODO: is this what we want to do or return a single value if over some number?
    return list(set(types))


def get_uberon_ids(
    properties: Dict[str, Any],
    request_handler: RequestHandler
) -> List[str]:
    """Get uberon ids associated with external output file."""
    return list(set(get_property_values_from_identifiers(
        request_handler,
        [
            item_utils.get_uuid(request_handler.get_item(sample_source)) for 
            sample_source in get_sample_sources_from_analysis_runs(
                properties.get("analysis_runs", []),
                request_handler
            )  
        ],
        tissue_utils.get_uberon_id
    )))
