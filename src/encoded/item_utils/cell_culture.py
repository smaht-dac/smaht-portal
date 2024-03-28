from typing import Any, Dict, Union

from . import item


def is_cell_culture(properties: Dict[str, Any]) -> bool:
    """Check if item is a cell culture."""
    return item.get_type(properties) == "CellCulture"


def get_cell_line(properties: Dict[str, Any]) -> Union[Dict[str, Any], str]:
    """Get the cell line of a cell culture."""
    return properties.get("cell_line", "")
