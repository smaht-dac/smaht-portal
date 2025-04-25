from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("analyte_preparation", "1", "2")
def upgrade_analyte_preparation_1_2(
    value: Dict[str, Any], system: Dict[str, Any]
) -> Dict[str, Any]:
    """Change `cell_sorting_method' property to `cell_selection_method`."""
    cell_sorting = value.get("cell_sorting_method")
    if cell_sorting:
        value["cell_selection_method"] = cell_sorting
        del value["cell_sorting_method"]