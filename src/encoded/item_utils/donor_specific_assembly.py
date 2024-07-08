from typing import List, Dict, Any, Union, Optional
from functools import partial

from .utils import RequestHandler, get_property_value_from_identifier, get_property_values_from_identifiers
from . import (
    sample as sample_utils,
    tissue as tissue_utils,
    cell_culture as cell_culture_utils,
    cell_culture_mixture as cell_culture_mixture_utils,
    cell_line as cell_line_utils,
    file as file_utils
)
from .file_format import get_standard_file_extension

def get_file_format_id(request_handler: RequestHandler,identifier: str):
    """Return identifier of file_format for file."""
    return get_property_value_from_identifier(request_handler,identifier,file_utils.get_file_format)


def get_derived_from(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get files the donor-specific assembly is derived from."""
    return properties.get("derived_from", [])


def get_software(properties: Dict[str, Any]):
    """Get software for the assembly."""
    return properties.get("software", [])
    

def get_samples(properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None) -> List[Union[str, Dict[str, Any]]]:
    """Get samples associated with assembly."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_derived_from(properties),
            partial(file_utils.get_samples, request_handler=request_handler),
        )
    return properties.get("samples", [])


def get_sample_sources(properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None) -> List[Union[str, Dict[str, Any]]]:
    """Get sample sources from the samples the assembly is derived from."""
    if request_handler:
        samples = get_samples(properties,request_handler)
        return get_property_values_from_identifiers(request_handler,samples,sample_utils.get_sample_sources)
    return []


def get_tissues(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get tissues associated with the assembly."""
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
    """Get cell culture mixtures associated with the assembly."""
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
    """Get cell cultures associated with the assembly."""
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
    """Get cell lines associated with the assembly."""
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
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[Union[str, Dict[str, Any]]]:
    """Get donors or cell lines of the assembly."""
    tissues = get_tissues(properties, request_handler)
    cell_lines = get_cell_lines(properties, request_handler)
    result =  list(
        set(
            get_property_values_from_identifiers(
                request_handler, tissues, tissue_utils.get_donor
            )
            + get_property_values_from_identifiers(
                request_handler, cell_lines, cell_line_utils.get_donor
            )
        )
    )
    return result

def is_fasta_file(request_handler: RequestHandler, identifier: str):
    """Check if file_format has the fa file extension."""
    format_id = get_file_format_id(request_handler,identifier)
    return get_property_value_from_identifier(request_handler,format_id,get_standard_file_extension) in ["fa","fasta"]


def is_chain_file(request_handler: RequestHandler,identifier: str):
    """Check if file_format has the chain.gz file extension."""
    format_id = get_file_format_id(request_handler,identifier)
    return get_property_value_from_identifier(request_handler,format_id,get_standard_file_extension) == "chain.gz"


def get_chain_files(request_handler: RequestHandler, files: List[str]=None):
    """Return files with chain.gz file extension."""
    chains=[]
    for file in files:
        if is_chain_file(request_handler,file):
            chains+=[file]
    return chains


def get_sequence_files(request_handler: RequestHandler, files: List[str]=None):
    """Return files with fa file extension."""
    seq_files=[]
    for file in files:
        if is_fasta_file(request_handler,file):
            seq_files+=[file]
    return seq_files