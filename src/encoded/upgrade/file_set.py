from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("file_set", "1", "2")
def upgrade_file_set_1_2(value: Dict[str, Any], system: Dict[str, Any]) -> None:
    """Remove `assay` linkTo (moved to Library)."""
    assay = value.get("assay")
    if assay:
        del value["assay"]
