import re
from typing import Any, Dict, List, Optional, Set, Union

from .utils import (
    RequestHandler,
    get_property_values_from_identifiers,
)

from . import (
    item as item_utils,
    sample as sample_utils,
    tissue as tissue_utils
)

from .constants import tissue_sample as tissue_sample_constants

from ..item_utils.tissue import (
    BENCHMARKING_ID_REGEX,
    PRODUCTION_ID_REGEX
)

CORE_REGEX = "-[0-9]{3}[A-F][1-6]$"
SPECIMEN_REGEX = "-[0-9]{3}[S-W][1-9]$"
HOMOGENATE_REGEX = "-[0-9]{3}X$"
TISSUE_ALIQUOT_REGEX = "-[0-9]{3}$"

BENCHMARKING_CORE_EXTERNAL_ID_REGEX = re.compile(
    rf"^{BENCHMARKING_ID_REGEX}{CORE_REGEX}"
)
PRODUCTION_CORE_EXTERNAL_ID_REGEX = re.compile(
    rf"^{PRODUCTION_ID_REGEX}{CORE_REGEX}"
)

BENCHMARKING_SPECIMEN_EXTERNAL_ID_REGEX = re.compile(
    rf"^{BENCHMARKING_ID_REGEX}{SPECIMEN_REGEX}"
)
PRODUCTION_SPECIMEN_EXTERNAL_ID_REGEX = re.compile(
    rf"^{PRODUCTION_ID_REGEX}{SPECIMEN_REGEX}"
)

BENCHMARKING_HOMOGENATE_EXTERNAL_ID_REGEX = re.compile(
    rf"^{BENCHMARKING_ID_REGEX}{HOMOGENATE_REGEX}"
)
PRODUCTION_HOMOGENATE_EXTERNAL_ID_REGEX = re.compile(
    rf"^{PRODUCTION_ID_REGEX}{HOMOGENATE_REGEX}"
)

BENCHMARKING_TISSUE_ALIQUOT_EXTERNAL_ID_REGEX = re.compile(
    rf"^{BENCHMARKING_ID_REGEX}{TISSUE_ALIQUOT_REGEX}"
)
PRODUCTION_TISSUE_ALIQUOT_EXTERNAL_ID_REGEX = re.compile(
    rf"^{PRODUCTION_ID_REGEX}{TISSUE_ALIQUOT_REGEX}"
)


def get_category(properties: Dict[str, Any]) -> str:
    """Get category from properties."""
    return properties.get("category", "")


def is_homogenate(properties: Dict[str, Any]) -> bool:
    return get_category(properties) == "Homogenate"


def is_core(properties: Dict[str, Any]) -> bool:
    """Check if category from properties is Core."""
    return get_category(properties) == "Core"


def is_specimen(properties: Dict[str, Any]) -> bool:
    """Check if category from properties is Specimen."""
    return get_category(properties) == "Specimen"


def has_spatial_information(properties: Dict[str, Any]) -> bool:
    """Check if category from properties is Specimen or Core.
    
    This indicates the presence of spatial info in external id."""
    return is_specimen(properties) or is_core(properties)


def is_core_external_id(external_id: str) -> bool:
    """Check if external_id matches core sample regex from benchmarking or production."""
    return BENCHMARKING_CORE_EXTERNAL_ID_REGEX.match(external_id) is not None or PRODUCTION_CORE_EXTERNAL_ID_REGEX.match(external_id) is not None


def is_specimen_external_id(external_id: str) -> bool:
    """Check if external_id matches specimen sample regex from benchmarking or production."""
    return BENCHMARKING_SPECIMEN_EXTERNAL_ID_REGEX.match(external_id) is not None or PRODUCTION_SPECIMEN_EXTERNAL_ID_REGEX.match(external_id) is not None


def is_homogenate_external_id(external_id: str) -> bool:
    """Check if external_id matches homogenate sample regex from benchmarking or production."""
    return BENCHMARKING_HOMOGENATE_EXTERNAL_ID_REGEX.match(external_id) is not None or PRODUCTION_HOMOGENATE_EXTERNAL_ID_REGEX.match(external_id) is not None


def is_tissue_aliquot_external_id(external_id: str) -> bool:
    """Check if external_id matches tissue aliquot sample regex from benchmarking or production."""
    return BENCHMARKING_TISSUE_ALIQUOT_EXTERNAL_ID_REGEX.match(external_id) is not None or PRODUCTION_TISSUE_ALIQUOT_EXTERNAL_ID_REGEX.match(external_id) is not None


def is_benchmarking(properties: Dict[str, Any]) -> bool:
    """Check if tissue sample is from benchmarking study."""
    external_id = item_utils.get_external_id(properties)
    return re.match(BENCHMARKING_ID_REGEX, external_id) is not None


def is_production(properties: Dict[str, Any]) -> bool:
    """Check if tissue sample is from production study."""
    external_id = item_utils.get_external_id(properties)
    return re.match(PRODUCTION_ID_REGEX, external_id) is not None


def get_donor(request_handler: RequestHandler, properties: Dict[str, Any]) -> List[str]:
    """Get donor from tissue from properties sample_soures."""
    tissues = sample_utils.get_tissues(properties, request_handler)
    return get_property_values_from_identifiers(
        request_handler,
            tissues,
            tissue_utils.get_donor
        )


def get_tissue_kit_id(properties: Dict[str, Any]) -> str:
    """Get tissue kit ID associated with tissue sample."""
    external_id = item_utils.get_external_id(properties)
    if is_production(properties) or is_benchmarking(properties):
        return get_tissue_kit_id_from_external_id(external_id)
    return ""


def get_tissue_kit_id_from_external_id(external_id: str) -> str:
    """Get tissue kit ID from external ID."""
    return "-".join(external_id.split("-")[0:2])


def get_protocol_id_from_external_id(external_id: str) -> str:
    """Get protocol ID from external ID."""
    return external_id.split("-")[1]

def get_fixed_to_fresh_protocols() -> Dict[str, Set[str]]:
    """Reverse FRESH_TO_FIXED_PROTOCOL_MAP as fixed_protocol -> {fresh_protocols}.

    More than one fresh protocol can map to the same fixed protocol (e.g. the
    benchmarking skin specimen/core protocols 1J and 1K both -> 1L), so a plain
    `{v: k for k, v in ...}` comprehension silently drops all but one fresh
    protocol per fixed protocol. Centralized here so the association script and
    the linked_fixed_samples validator share one (correct) reverse mapping.
    """
    reverse_map: Dict[str, Set[str]] = {}
    for fresh_protocol, fixed_protocol in tissue_sample_constants.FRESH_TO_FIXED_PROTOCOL_MAP.items():
        reverse_map.setdefault(fixed_protocol, set()).add(fresh_protocol)
    return reverse_map


def get_associated_pathology_reports(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get pathology reports for fixed samples from the same tissue block.

    Chains this sample's `linked_fixed_samples` (forward link) through each
    fixed sample's own `pathology_reports` (rev_link_atids, present in the
    default @@object frame), preserving the fixed-sample pairing so callers
    can trace which fixed sample produced which report.
    """
    linked_fixed_samples = properties.get("linked_fixed_samples", [])
    fixed_samples = request_handler.get_items(linked_fixed_samples)
    return [
        {
            "fixed_sample_external_id": item_utils.get_external_id(fixed_sample),
            "pathology_reports": fixed_sample.get("pathology_reports", []),
        }
        for fixed_sample in fixed_samples
    ]