from typing import List, Dict, Any, Union, Optional
from functools import partial

from .utils import RequestHandler, get_property_value_from_identifier, get_property_values_from_identifiers
from . import (
    file as file_utils
)

def get_file_format_id(request_handler: RequestHandler,identifier: str):
    """Return identifier of file_format for file."""
    return get_property_value_from_identifier(request_handler,identifier,file_utils.get_file_format)


def get_derived_from(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get files the donor-specific assembly is derived from."""
    return properties.get("derived_from", [])


def get_software(properties: Dict[str, Any]):
    """Get software for the assembly."""
    return properties.get("software", [])


def get_cell_lines(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[Union[str, Dict[str, Any]]]:
    """Get cell_lines from the derived_from files of the assembly."""
    derived_from = get_derived_from(properties)
    return get_property_values_from_identifiers(
                request_handler, derived_from, partial(file_utils.get_cell_lines, request_handler=request_handler)
            )


def get_donors(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get donors from the derived_from files of the assembly."""
    if request_handler:
        return get_property_values_from_identifiers(
                request_handler, get_derived_from(properties), partial(file_utils.get_donors, request_handler=request_handler)
            )
    return get_derived_from(properties).get("donors","")



def get_supplementary_files(request_handler: RequestHandler, files: List[str] = None):
    """Return rev-linked non-fasta files."""
    supp_files=[]
    for file in files:
        if not get_property_value_from_identifier(
            request_handler,
            file,
            partial(file_utils.is_fasta_file,request_handler=request_handler)
        ):
            supp_files+=[file]
    return supp_files


def get_sequence_files(request_handler: RequestHandler, files: List[str] = None):
    """Return rev-linked files with fa file extension."""
    seq_files=[]
    for file in files:
        if get_property_value_from_identifier(
            request_handler,
            file,
            partial(file_utils.is_fasta_file,request_handler=request_handler)
        ):
            seq_files+=[file]
    return seq_files