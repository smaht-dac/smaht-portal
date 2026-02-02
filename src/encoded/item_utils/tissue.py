import functools
import re
from typing import Any, Dict, Union

from . import constants, donor, item

from ..item_utils import (
    ontology_term as ot_utils,
)

from .utils import (
    get_property_value_from_identifier,
    RequestHandler,
)

def is_tissue(properties: Dict[str, Any]) -> bool:
    """Check if sample source is tissue."""
    return item.get_type(properties) == "Tissue"


def get_donor(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get donor associated with tissue."""
    return properties.get("donor", "")


def get_location(properties: Dict[str, Any]) -> str:
    """Get location of tissue."""
    return properties.get("anatomical_location", "")


def get_uberon_id(properties: Dict[str, Any]) -> str:
    """Get uberon id associated with tissue"""
    return properties.get("uberon_id","")


def get_grouping_term_from_tag(properties: Dict[str, Any], request_handler: RequestHandler, tag: str) -> str:
    """Get top grouping term associated with tissue"""
    return get_property_value_from_identifier(
        request_handler,
        get_uberon_id(properties),
        functools.partial(
            ot_utils.get_grouping_term_from_tag, request_handler=request_handler, tag=tag
        )
    )


def get_study(properties: Dict[str, Any]) -> str:
    """Get study associated with tissue.

    Parse external ID to see if matches TPC naming standards to
    indicate benchmarking vs. production. TTD tissues unlikely to match
    TPC naming standards, but not impossible; may be more robust to
    check submission centers or more detailed regex on TPC nomenclature.
    """
    if is_benchmarking(properties):
        return constants.BENCHMARKING_STUDY
    if is_production(properties):
        return constants.PRODUCTION_STUDY
    return ""


TPC_ID_COMMON_PATTERN = donor.TPC_ID_COMMON_PATTERN + r"-[0-9][A-Z]{1,2}"
BENCHMARKING_ID_REGEX = rf"{constants.BENCHMARKING_PREFIX}{TPC_ID_COMMON_PATTERN}"
PRODUCTION_ID_REGEX = rf"{constants.PRODUCTION_PREFIX}{TPC_ID_COMMON_PATTERN}"
TPC_ALT_ID_REGEX = rf"{constants.TPC_ALT_DONOR_PREFIX}{TPC_ID_COMMON_PATTERN}"

BENCHMARKING_TISSUE_REGEX = re.compile(
    rf"{BENCHMARKING_ID_REGEX}$"
)
PRODUCTION_TISSUE_REGEX = re.compile(
    rf"{PRODUCTION_ID_REGEX}$"
)
TPC_ALT_TISSUE_REGEX = re.compile(
    rf"{TPC_ALT_ID_REGEX}$"
)

def is_benchmarking(properties: Dict[str, Any]) -> bool:
    """Check if tissue is from benchmarking study."""
    external_id = item.get_external_id(properties)
    return BENCHMARKING_TISSUE_REGEX.match(external_id) is not None


def is_production(properties: Dict[str, Any]) -> bool:
    """Check if tissue is from production study."""
    external_id = item.get_external_id(properties)
    return PRODUCTION_TISSUE_REGEX.match(external_id) is not None


def is_valid_external_id(external_id: str) -> bool:
    """Check if tissue external_id matches Benchmarking or Production."""
    return PRODUCTION_TISSUE_REGEX.match(external_id) is not None or BENCHMARKING_TISSUE_REGEX.match(external_id) is not None


def get_project_id(properties: Dict[str, Any]) -> str:
    """Get project ID associated with tissue."""
    if is_benchmarking(properties):
        return constants.BENCHMARKING_PREFIX
    if is_production(properties):
        return constants.PRODUCTION_PREFIX
    return ""


def get_donor_kit_id(properties: Dict[str, Any]) -> str:
    """Get donor kit ID associated with tissue."""
    external_id = item.get_external_id(properties)
    return get_donor_kit_id_from_external_id(external_id)


def get_donor_kit_id_from_external_id(external_id: str) -> str:
    """Get donor kit ID from external ID."""
    if PRODUCTION_TISSUE_REGEX.match(external_id):
        return external_id.split("-")[0].strip(constants.PRODUCTION_PREFIX)
    if BENCHMARKING_TISSUE_REGEX.match(external_id):
        return external_id.split("-")[0].strip(constants.BENCHMARKING_PREFIX)
    return ""


def get_donor_id_from_external_id(external_id: str) -> str:
    """Get donor ID from external ID."""
    return external_id.split("-")[0]


def get_protocol_id(properties: Dict[str, Any]) -> str:
    """Get protocol ID associated with tissue."""
    if is_benchmarking(properties) or is_production(properties):
        external_id = item.get_external_id(properties)
        return get_protocol_id_from_external_id(external_id)
    return ""


def get_protocol_id_from_external_id(external_id: str) -> str:
    """Get protocol ID from external ID."""
    return external_id.split("-")[1]


def is_fibroblast(properties: Dict[str, Any]) -> bool:
    """Check if tissue is fibroblast from protocol ID."""
    return get_protocol_id(properties) == "3AC"


def is_germ_cell(properties: Dict[str, Any]) -> bool:
    """Check if tissue is germ cell (ovary or testis) from protocol ID."""
    return get_protocol_id(properties) in ["3U", "3V","3W", "3X", "3Y", "3Z", "3AA", "3AB"]


def is_clinically_accessible(properties: Dict[str, Any]) -> bool:
    """Check if tissue is clinically accessible (blood or buccal swab) from protocol ID."""
    return get_protocol_id(properties) in ["3A", "3B"]


def get_tissue_type(properties: Dict[str, Any], request_handler: RequestHandler):
    """
    Get tissue type of tissue from ontology term.
    
    Special handling of fibroblasts (3AC)
    """
     # Use tissue code from external id to identify fibroblast
    fibroblast = is_fibroblast(properties)
    if fibroblast:
        return "3AC - Fibroblast"
    # otherwise use ontology term `preferred name` to set tissue type
    tissue_type = get_grouping_term_from_tag(
        properties,
        request_handler=request_handler,
        tag="tissue_type"
    )
    # Use donor code from external id to identify benchmarking samples
    if tissue_type and is_benchmarking(properties):
        if " - " in tissue_type:
            # NOTE: Relies on formatting of ontology term to be [TPC code] - [Tissue type]
            return tissue_type.split(' - ')[1]
    return tissue_type
        
    
def get_category(properties: Dict[str, Any], request_handler: RequestHandler) -> str:
    """
    Get category associated with tissue.
    
    Special handling of fibroblast, ovary, testis, blood, and buccal swab.
    """
    if is_germ_cell(properties):
        return "Germ Cells"
    elif is_clinically_accessible(properties):
        return "Clinically Accessible"
    elif is_fibroblast(properties):
        return "Mesoderm"
    else:
        germ_layer = get_grouping_term_from_tag(properties, request_handler=request_handler, tag="germ_layer")
        return germ_layer or None

        