import functools
from typing import Any, Dict, List, Union

from . import cell_culture, item
from .utils import (
    RequestHandler,
    get_property_values_from_identifiers,
    get_unique_values,
)


def get_components(properties: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Get components from cell culture mixture."""
    return properties.get("components", [])


def get_cell_culture(component: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get cell culture from component."""
    return component.get("cell_culture", "")


def is_cell_culture_mixture(properties: Dict[str, Any]) -> bool:
    """Check if item is a cell culture mixture."""
    return item.get_type(properties) == "CellCultureMixture"


def get_cell_line_codes(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> Dict[str, Any]:
    """Get cell line codes from cell culture mixture."""
    return get_property_values_from_identifiers(
        request_handler,
        get_cell_lines(request_handler, properties),
        item.get_code,
    )


def get_cell_lines(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[Union[str, Dict[str, Any]]]:
    """Get cell lines from cell culture mixture."""
    cell_cultures = get_cell_cultures(properties)
    return get_property_values_from_identifiers(
        request_handler,
        cell_cultures,
        functools.partial(cell_culture.get_cell_line),
    )


def get_cell_cultures(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get cell cultures from components."""
    components = get_components(properties)
    return [get_cell_culture(component) for component in components]
