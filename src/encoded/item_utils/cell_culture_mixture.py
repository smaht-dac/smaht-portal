from typing import Any, Dict

from . import item


def is_cell_culture_mixture(properties: Dict[str, Any]) -> bool:
    """Check if item is a cell culture mixture."""
    return item.get_type(properties) == "CellCultureMixture"
