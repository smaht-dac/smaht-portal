import re
from typing import Any, Dict, List, Optional, Union

from ..item_utils.utils import RequestHandler,  get_property_values_from_identifiers
from ..item_utils import (
    sample as sample_utils,
    item as item_utils
)

from .utils import RequestHandler, get_property_values_from_identifiers

from . import (
    item as item_utils,
    sample as sample_utils,
    tissue as tissue_utils
)


from ..item_utils.tissue import (
    BENCHMARKING_ID_REGEX,
    PRODUCTION_ID_REGEX
)

CORE_REGEX = "-[0-9]{3}[A-F][1-6]$"
SPECIMEN_REGEX = "-[0-9]{3}[S-W][1-9]$"
HOMOGENATE_REGEX = "-[0-9]{3}X$"

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

def get_category(properties: Dict[str, Any]) -> str:
    """Get category from properties."""
    return properties.get("category", "")


def is_homogenate(properties: Dict[str, Any]) -> bool:
    return get_category(properties) == "Homogenate"


def get_tissue_submission_centers(properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None) -> List[Union[None, str]]:
    """Get submission_centers of sample_sources tissue from properties."""
    tissues = sample_utils.get_tissues(properties)
    if request_handler:
        submission_centers = []
        for tissue in tissues:
            center = item_utils.get_submission_centers(request_handler.get_item(tissue))
            submission_centers.append(center) if center not in submission_centers else submission_centers
    return []


def is_core_external_id(properties: Dict[str, Any]) -> bool:
    """Check if external_id matches core sample regex from benchmarking or production."""
    external_id = item_utils.get_external_id(properties)
    return BENCHMARKING_CORE_EXTERNAL_ID_REGEX.match(external_id) is not None or PRODUCTION_CORE_EXTERNAL_ID_REGEX.match(external_id) is not None


def is_specimen_external_id(properties: Dict[str, Any]) -> bool:
    """Check if external_id matches specimen sample regex from benchmarking or production."""
    external_id = item_utils.get_external_id(properties)
    return BENCHMARKING_SPECIMEN_EXTERNAL_ID_REGEX.match(external_id) is not None or PRODUCTION_SPECIMEN_EXTERNAL_ID_REGEX.match(external_id) is not None


def is_homogenate_external_id(properties: Dict[str, Any]) -> bool:
    """Check if external_id matches homogenate sample regex from benchmarking or production."""
    external_id = item_utils.get_external_id(properties)
    return BENCHMARKING_HOMOGENATE_EXTERNAL_ID_REGEX.match(external_id) is not None or PRODUCTION_HOMOGENATE_EXTERNAL_ID_REGEX.match(external_id) is not None


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
