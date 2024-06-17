import functools
import re
from typing import Any, Dict, List, Optional, Union

from . import (
    cell_culture,
    cell_culture_mixture,
    constants,
    item,
    sample_source,
    tissue,
    tissue_sample,
)
from .utils import (
    get_property_value_from_identifier,
    get_property_values_from_identifiers,
    RequestHandler,
)


def get_tissues(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get tissues associated with sample."""
    sample_sources = get_sample_sources(properties)
    if request_handler:
        return [
            sample_source
            for sample_source in sample_sources
            if tissue.is_tissue(request_handler.get_item(sample_source))
        ]
    return [
        sample_source
        for sample_source in sample_sources
        if isinstance(sample_source, dict) and tissue.is_tissue(sample_source)
    ]


def get_sample_sources(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get sample sources associated with sample."""
    return properties.get("sample_sources", [])


def is_tissue_sample(properties: Dict[str, Any]) -> bool:
    """Check if sample is a tissue."""
    return item.get_type(properties) == "TissueSample"


def is_cell_culture_sample(properties: Dict[str, Any]) -> bool:
    """Check if sample is a cell culture."""
    return item.get_type(properties) == "CellCultureSample"


def is_cell_sample(properties: Dict[str, Any]) -> bool:
    """Check if sample is a cell."""
    return item.get_type(properties) == "CellSample"


def get_sample_names(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[str]:
    """Get official name(s) for the sample.

    What is referred to as the sample name here generally depends on
    whether the sample derives from a Tissue or a CellCulture(Mixture).

    If the sample has an id (usually if Tissue-derived), use that as
    the name.

    Otherwise, check sample sources for appropriate names, which are
    codes on CellLines or CellCultureMixtures.
    """
    if sample_id := item.get_external_id(properties):
        return [sample_id]
    if is_cell_culture_sample(properties) and request_handler:
        return get_sample_names_from_sources(request_handler, properties)
    return []


def get_sample_names_from_sources(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Attempt to get an official sample name from its sources."""
    names = get_property_values_from_identifiers(
        request_handler,
        get_sample_sources(properties),
        functools.partial(sample_source.get_code, request_handler),
    )
    return [f"{constants.PRODUCTION_PREFIX}{name}" for name in names]


def get_sample_descriptions(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[str]:
    """Get description for sample.

    Similar to the name, this depends on the sample type and/or its
    sources.
    """
    result = []
    if is_tissue_sample(properties):
        if category := tissue_sample.get_category(properties):
            result = [category]
    elif is_cell_culture_sample(properties) and request_handler:
        result = get_sample_descriptions_from_sources(properties, request_handler)
    return result


def get_sample_descriptions_from_sources(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[str]:
    """Attempt to get an official sample description from its sources."""
    return get_property_values_from_identifiers(
        request_handler,
        get_sample_sources(properties),
        functools.partial(
            get_sample_source_description, request_handler=request_handler
        ),
    )


def get_sample_source_description(
    sample_source: Dict[str, Any], request_handler: RequestHandler
) -> List[str]:
    """Get description for a given sample source.

    Currently only used for CellLines and CellCultureMixtures.
    """
    result = []
    if cell_culture_mixture.is_cell_culture_mixture(sample_source):
        result = cell_culture_mixture.get_cell_line_codes(
            request_handler, sample_source
        )
    if cell_culture.is_cell_culture(sample_source):
        result = [
            get_property_value_from_identifier(
                request_handler,
                cell_culture.get_cell_line(sample_source),
                item.get_code,
            )
        ]
    return result


def get_studies(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler]
) -> List[str]:
    """Get 'studies' associated with sample.

    Idea is to identify whether the sample belongs to benchmarking
    or production data for now. A little hacky, but heuristics are to
    check:

    - If has ID, check for benchmarking vs production based on TPC prefix
    - If no ID, check sample sources for codes
    """
    if study := get_study(properties):
        return [study]
    if request_handler:
        return get_studies_from_sources(request_handler, properties)
    return []


TPC_ID_COMMON_PATTERN = tissue.TPC_ID_COMMON_PATTERN + (
    r"-(X)|([0-9]{3}X)|([0-9]{3}[A-F][1-6])|([0-9]{3}[S-W][1-9])$"
)
BENCHMARKING_ID_REGEX = re.compile(
    rf"{constants.BENCHMARKING_PREFIX}{TPC_ID_COMMON_PATTERN}"
)
PRODUCTION_ID_REGEX = re.compile(
    rf"{constants.PRODUCTION_PREFIX}{TPC_ID_COMMON_PATTERN}"
)


def get_study(properties: Dict[str, Any]) -> str:
    """Get study from external ID."""
    external_id = item.get_external_id(properties)
    if BENCHMARKING_ID_REGEX.match(external_id):
        return constants.BENCHMARKING_STUDY
    if PRODUCTION_ID_REGEX.match(external_id):
        return constants.PRODUCTION_STUDY
    return ""


def get_studies_from_sources(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Attempt to get an official study from its sources."""
    return get_property_values_from_identifiers(
        request_handler,
        get_sample_sources(properties),
        functools.partial(sample_source.get_study, request_handler),
    )


def get_aliquot_id(properties: Dict[str, Any]) -> str:
    """Get aliquot ID associated with sample."""
    external_id = item.get_external_id(properties)
    if BENCHMARKING_ID_REGEX.match(external_id) or PRODUCTION_ID_REGEX.match(
        external_id
    ):
        return external_id.split("-")[2]
    return ""
