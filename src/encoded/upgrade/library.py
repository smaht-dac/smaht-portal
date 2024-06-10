from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("library", "1", "2")
def upgrade_library_1_2(
    value: Dict[str, Any], system: Dict[str, Any]
) -> Dict[str, Any]:
    """Change `analyte` linkTo to `analytes` list of linkTos."""
    analyte = value.get("analyte")
    if analyte:
        value["analytes"] = [analyte]
        del value["analyte"]
