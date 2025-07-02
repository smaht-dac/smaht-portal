from functools import partial
from typing import Any, Dict, List, Union

from . import sample as sample_utils
from .utils import RequestHandler, get_property_values_from_identifiers


def get_samples(analyte: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get samples connected to analyte."""
    return analyte.get("samples", [])


def get_molecule(analyte: Dict[str, Any]) -> List[str]:
    """Get molecule connected to analyte."""
    return analyte.get("molecule", [])


def get_analyte_preparation(analyte: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get analyte preparation connected to analyte."""
    return analyte.get("analyte_preparation", "")


def get_all_samples(
    request_handler: RequestHandler, analyte: Dict[str, Any]
) -> List[Union[str, Dict[str, Any]]]:
    """Get all samples connected to analyte (including parent samples)."""
    samples = get_samples(analyte)
    parent_samples = get_property_values_from_identifiers(
        request_handler,
        samples,
        partial(sample_utils.get_all_parent_samples, request_handler),
    )
    return samples + [sample for sample in parent_samples if sample not in samples]
