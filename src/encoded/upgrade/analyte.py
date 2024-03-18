from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("analyte", "1", "2")
def upgrade_analyte_1_2(value: Dict[str, Any], system: Dict[str, Any]) -> None:
    """Change `components` to `molecule_detail`."""
    components = value.get("components")
    if components is not None:
        if components:
            value["molecule_detail"] = components
        del value["components"]
