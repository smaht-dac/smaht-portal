from typing import Any, Dict, Union, Optional, List
from .utils import RequestHandler, get_property_value_from_identifier, get_property_values_from_identifiers
from . import (
    donor_specific_assembly as dsa_utils,
    file as file_utils,
    item as item_utils
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


def is_genome_assembly(properties: Dict[str, Any]):
    """Check if data category is Genome Assembly"""
    return "Genome Assembly" in file_utils.get_data_category(properties)


def is_reference_conversion(properties: Dict[str, Any]):
    """Check if data category is Genome Conversion"""
    return "Reference Conversion" in file_utils.get_data_category(properties)


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


def get_haplotype(properties: Dict[str, Any]) -> Union[str, Dict[str, Any], None]:
    """Get haplotype from properties."""
    return properties.get("haplotype", "")


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
