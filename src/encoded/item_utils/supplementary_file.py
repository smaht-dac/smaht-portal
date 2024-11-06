from typing import Any, Dict, Union, Optional, List
from functools import partial

from .utils import RequestHandler, get_property_value_from_identifier, get_property_values_from_identifiers
from . import (
    donor_specific_assembly as dsa_utils,
    file as file_utils,
    item as item_utils,
    file_set as file_set_utils,
    library as library_utils,
    sample as sample_utils,
    tissue as tissue_utils,
    cell_culture as cell_culture_utils,
    cell_culture_mixture as cell_culture_mixture_utils,
    cell_line as cell_line_utils,
    sequencing as sequencing_utils
)

def is_supplementary_file(properties: Dict[str, Any]) -> bool:
    """Check if item is a supplementary file."""
    return item_utils.get_type(properties) == "SupplementaryFile"


def is_fasta_file(properties: Dict[str,Any], request_handler: RequestHandler):
    """Check if file_format has the fa or fasta file extension."""
    return file_utils.get_file_extension(properties,request_handler) in ["fasta", "fa"]


def is_chain_file(properties: Dict[str, Any],request_handler: RequestHandler):
    """Check if file_format has the chain.gz file extension."""
    return file_utils.get_file_extension(properties,request_handler) == "chain.gz"


def get_donor_specific_assembly(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get donor-specific assembly from properties."""
    return properties.get("donor_specific_assembly", "")

def get_source_assembly(properties: Dict[str, Any]) -> Union[str, Dict[str, Any], None]:
    """Get source assembly from properties."""
    return properties.get("source_assembly", "")


def get_target_assembly(properties: Dict[str, Any]) -> Union[str, Dict[str, Any], None]:
    """Get target assembly from properties."""
    return properties.get("target_assembly", "")


def get_reference_genome(properties: Dict[str, Any]) -> Union[str, Dict[str, Any], None]:
    """Get reference genome from properties."""
    return properties.get("reference_genome", "")


def get_derived_from(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get derived_from files associated with file."""
    if request_handler:
        return get_property_value_from_identifier(
            request_handler,
            get_donor_specific_assembly(properties),
            dsa_utils.get_derived_from,
        )
    return properties.get("derived_from", [])


def get_derived_from_file_sets(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get file_sets of the derived_from files associated with file."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_derived_from(properties,request_handler),
            file_utils.get_file_sets,
        )
    return properties.get("file_sets", [])  


def get_sequencings(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get sequencings associated with file."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_derived_from_file_sets(properties, request_handler), 
            file_set_utils.get_sequencing
        )
    return properties.get("sequencing", [])


def get_sequencers(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[str]:
    """Get sequencers associated with file."""
    sequencings = get_sequencings(properties, request_handler)
    return get_property_values_from_identifiers(
        request_handler, sequencings, sequencing_utils.get_sequencer
    )


def get_libraries(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get libraries associated with file from derived_from files."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler, 
            get_derived_from_file_sets(properties,request_handler),
            file_set_utils.get_libraries
        )
    return properties.get("libraries", [])


def get_analytes(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get analytes associated with file from derived_from files."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_libraries(properties, request_handler),
            library_utils.get_analytes,
        )
    return properties.get("analytes", [])


def get_assays(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get assays associated with file."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_libraries(properties, request_handler),
            library_utils.get_assay,
        )
    return properties.get("assays", [])


def get_dsa_software(
        properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None 
) -> List[Union[str, Dict[str, Any]]]:
    """Get software from donor-specific assembly associated with file."""
    if request_handler:
        return get_property_value_from_identifier(
            request_handler,
            get_donor_specific_assembly(properties),
            dsa_utils.get_software,
        )
    return []


def get_samples(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get samples associated with file."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_derived_from_file_sets(properties, request_handler),
            partial(file_set_utils.get_samples, request_handler=request_handler),
        )
    return properties.get("samples", [])


def get_sample_sources(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get sample sources associated with file."""
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
    """Get tissues associated with file."""
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


def get_cell_culture_mixtures(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get cell culture mixtures associated with file."""
    sample_sources = get_sample_sources(properties, request_handler=request_handler)
    if request_handler:
        return [
            sample_source
            for sample_source in sample_sources
            if cell_culture_mixture_utils.is_cell_culture_mixture(
                request_handler.get_item(sample_source)
            )
        ]
    return [
        sample_source
        for sample_source in sample_sources
        if isinstance(sample_source, dict)
        and cell_culture_mixture_utils.is_cell_culture_mixture(sample_source)
    ]


def get_cell_cultures(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[str]:
    """Get cell cultures associated with file."""
    sample_sources = get_sample_sources(properties, request_handler=request_handler)
    cell_culture_mixtures = get_cell_culture_mixtures(
        properties, request_handler=request_handler
    )
    cell_cultures_from_mixtures = get_property_values_from_identifiers(
        request_handler, cell_culture_mixtures, cell_culture_mixture_utils.get_cell_cultures
    )
    direct_cell_cultures = [
        sample_source
        for sample_source in sample_sources
        if cell_culture_utils.is_cell_culture(request_handler.get_item(sample_source))
    ]
    return list(set(cell_cultures_from_mixtures + direct_cell_cultures))


def get_cell_lines(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[Union[str, Dict[str, Any]]]:
    """Get cell lines associated with file."""
    cell_cultures = get_cell_cultures(properties, request_handler)
    cell_culture_mixtures = get_cell_culture_mixtures(
        properties, request_handler=request_handler
    )
    return list(
        set(
            get_property_values_from_identifiers(
                request_handler, cell_cultures, cell_culture_utils.get_cell_line
            )
            + get_property_values_from_identifiers(
                request_handler,
                cell_culture_mixtures,
                partial(cell_culture_mixture_utils.get_cell_lines, request_handler),
            )
        )
    )


def get_donors(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get donors associated with file."""
    if request_handler:
        tissues = get_tissues(properties, request_handler)
        cell_lines = get_cell_lines(properties, request_handler)
        return list(
            set(
                get_property_values_from_identifiers(
                    request_handler, tissues, tissue_utils.get_donor
                )
                + get_property_values_from_identifiers(
                    request_handler, cell_lines, partial(cell_line_utils.get_source_donor, request_handler)
                )
            )
        )
    return properties.get("donors", [])