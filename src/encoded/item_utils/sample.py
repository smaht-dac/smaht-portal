import functools
from typing import Any, Dict, List

from . import (
    cell_culture,
    cell_culture_mixture,
    constants,
    item,
    tissue,
    tissue_sample,
)
from .utils import (
    get_property_value_from_identifier,
    get_property_values_from_identifiers,
    RequestHandler,
)


def get_tissues(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[str]:
    """Get tissues associated with sample."""
    sample_sources = get_sample_sources(properties)
    return [
        sample_source
        for sample_source in sample_sources
        if tissue.is_tissue(request_handler.get_item(sample_source))
    ]


def get_sample_sources(properties: Dict[str, Any]) -> List[str]:
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
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get official name(s) for the sample.

    What is referred to as the sample name here generally depends on
    whether the sample derives from a Tissue or a CellCulture(Mixture).

    If the sample has an id (usually if Tissue-derived), use that as
    the name.

    Otherwise, check sample sources for appropriate names, which are
    codes on CellLines or CellCultureMixtures.
    """
    if is_tissue_sample(properties):
        if sample_id := item.get_external_id(properties):
            return [sample_id]
    if not is_tissue_sample(properties):
        return get_sample_names_from_sources(request_handler, properties)
    return []


def get_sample_names_from_sources(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Attempt to get an official sample name from its sources."""
    names = get_property_values_from_identifiers(
        request_handler,
        get_sample_sources(properties),
        functools.partial(get_sample_source_code, request_handler),
    )
    return [f"{constants.PRODUCTION_PREFIX}{name}" for name in names]
#    sample_sources = request_handler.get_items(get_sample_sources(properties))
#    return get_unique_values(
#        sample_sources, functools.partial(get_sample_source_code, request_handler)
#    )


def get_sample_source_code(
    request_handler: RequestHandler, sample_source: Dict[str, Any]
) -> str:
    """Get the code for a given sample source.

    Currently only used for CellLines and CellCultureMixtures.
    """
    if cell_culture_mixture.is_cell_culture_mixture(sample_source):
        return item.get_code(sample_source)
    if cell_culture.is_cell_culture(sample_source):
        return get_property_value_from_identifier(
            request_handler,
            cell_culture.get_cell_line(sample_source),
            item.get_code,
        )
    return ""


def get_sample_descriptions(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get description for sample.

    Similar to the name, this depends on the sample type and/or its
    sources.
    """
    result = []
    if is_tissue_sample(properties):
        if category := tissue_sample.get_category(properties):
            result = [category]
    else:
        result = get_sample_descriptions_from_sources(properties, request_handler)
    return result


def get_sample_descriptions_from_sources(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[str]:
    """Attempt to get an official sample description from its sources."""
    return get_property_values_from_identifiers(
        request_handler,
        get_sample_sources(properties),
        functools.partial(get_sample_source_description, request_handler),
    )
#    sample_sources = request_handler.get_items(get_sample_sources(properties))
#    return get_unique_values(
#        sample_sources,
#        functools.partial(get_sample_source_description, request_handler),
#    )


def get_sample_source_description(
    request_handler: RequestHandler, sample_source: Dict[str, Any]
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
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get 'studies' associated with sample.

    Idea is to identify whether the sample belongs to benchmarking
    or production data for now. A little hacky, but heuristics are to
    check:

    - If has ID, check for benchmarking vs production based on TPC prefix
    - If no ID, check sample sources for codes
    """
    if sample_id := item.get_external_id(properties):
        study = get_study_from_id(sample_id)
        if study:
            return [study]
        return []
    return get_studies_from_sources(request_handler, properties)


def get_study_from_id(sample_id: str) -> str:
    """Get study from sample id."""
    if sample_id.startswith(constants.BENCHMARKING_PREFIX):
        return constants.BENCHMARKING_STUDY
    if sample_id.startswith(constants.PRODUCTION_PREFIX):
        return constants.PRODUCTION_STUDY
    return ""


def get_studies_from_sources(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Attempt to get an official study from its sources."""
    return get_property_values_from_identifiers(
        request_handler,
        get_sample_sources(properties),
        functools.partial(get_sample_source_study, request_handler),
    )
#    sample_sources = request_handler.get_items(get_sample_sources(properties))
#    return get_unique_values(
#        sample_sources, functools.partial(get_sample_source_study, request_handler)
#    )


def get_sample_source_study(
    request_handler: RequestHandler, sample_source: Dict[str, Any]
) -> str:
    """Get study for a given sample source.

    Tissue study information identifiable by its external ID, while
    cell culture (mixture) study information identified by presence of
    code (and only indicative of benchmarking). TTD data, on the other
    hand, is not associated with any study, and assumption is such data
    will not match any of the criteria here.
    """
    if tissue.is_tissue(sample_source):
        return tissue.get_study(sample_source)
    else:
        code = get_sample_source_code(request_handler, sample_source)
        if code:
            return constants.BENCHMARKING_STUDY
    return ""
