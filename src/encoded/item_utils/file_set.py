from functools import partial
from typing import Any, Dict, List, Optional, Union

from . import (
    item as item_utils,
    library as library_utils,
    sample as sample_utils,
    sequencing as sequencing_utils,
    tissue as tissue_utils,
    file as file_utils,
)
from .utils import (
    RequestHandler,
    get_property_value_from_identifier,
    get_property_values_from_identifiers,
)


def get_sequencing(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get sequencing connected to file set."""
    return properties.get("sequencing", "")


def get_libraries(file_set: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get libraries connected to file set."""
    return file_set.get("libraries", [])


def get_samples(
    file_set: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[Dict[str, Any], str]]:
    """Get samples connected to file set.

    If samples not present as direct link, fetch samples from libraries,
    if possible.
    """
    result = []
    if samples := file_set.get("samples"):
        if request_handler:
            parent_samples = get_property_values_from_identifiers(
                request_handler,
                samples,
                partial(sample_utils.get_all_parent_samples, request_handler),
            )
            parents_to_add = [item for item in parent_samples if item not in samples]
            result = samples + parents_to_add
        else:
            result = samples
    elif request_handler:
        result = get_property_values_from_identifiers(
            request_handler,
            get_libraries(file_set),
            partial(library_utils.get_all_samples, request_handler=request_handler),
        )
    return result


def get_assays(request_handler: RequestHandler, file_set: Dict[str, Any]) -> List[str]:
    """Get assays connected to file set."""
    return get_property_values_from_identifiers(
        request_handler,
        get_libraries(file_set),
        library_utils.get_assay,
    )


def get_sequencer(
    request_handler: RequestHandler, file_set: Dict[str, Any]
) -> List[str]:
    """Get sequencers connected to file set."""
    return get_property_value_from_identifier(
        request_handler,
        get_sequencing(file_set),
        sequencing_utils.get_sequencer,
    )


def get_sample_sources(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get sample sources associated with file set."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_samples(properties, request_handler),
            sample_utils.get_sample_sources,
        )
    return properties.get("sample_sources", [])


def get_tissues(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get tissues associated with file set."""
    sample_sources = get_sample_sources(properties, request_handler=request_handler)
    if request_handler:
        return [
            sample_source
            for sample_source in sample_sources
            if tissue_utils.is_tissue(request_handler.get_item(sample_source))
        ]
    return [
        sample_source
        for sample_source in sample_sources
        if isinstance(sample_source, dict) and tissue_utils.is_tissue(sample_source)
    ]