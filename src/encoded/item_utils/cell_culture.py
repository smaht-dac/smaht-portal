from typing import Any, Dict

from . import item


def is_cell_culture(properties: Dict[str, Any]) -> bool:
    """Check if item is a cell culture."""
    return item.get_type(properties) == "CellCulture"
