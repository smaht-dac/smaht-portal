from typing import Any, Dict

from . import cell_culture, cell_culture_mixture, constants, item, tissue
from .utils import RequestHandler, get_property_values_from_identifiers


def get_code(request_handler: RequestHandler, sample_source: Dict[str, Any]) -> str:
    """Get the code for a given sample source.

    Currently only used for CellLines and CellCultureMixtures.
    """
    if cell_culture_mixture.is_cell_culture_mixture(sample_source):
        return item.get_code(sample_source)
    if cell_culture.is_cell_culture(sample_source):
        return get_property_values_from_identifiers(
            request_handler,
            cell_culture.get_cell_line(sample_source),
            item.get_code,
        )
    return ""


def get_study(request_handler: RequestHandler, sample_source: Dict[str, Any]) -> str:
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
        code = get_code(request_handler, sample_source)
        if code:
            return constants.BENCHMARKING_STUDY
    return ""


def get_cell_lines(
    request_handler: RequestHandler, sample_source: Dict[str, Any]
) -> str:
    """Get cell lines for a given sample source.

    Currently only used for CellCulture and CellCultureMixtures.
    """
    if cell_culture.is_cell_culture(sample_source):
        return cell_culture.get_cell_line(sample_source)
    if cell_culture_mixture.is_cell_culture_mixture(sample_source):
        return cell_culture_mixture.get_cell_lines(request_handler, sample_source)
    return []
