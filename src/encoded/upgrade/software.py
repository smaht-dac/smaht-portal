from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("software", "1", "2")
def upgrade_software_1_2(value: Dict[str, Any], system: Dict[str, Any]) -> None:
    """Handle `gpu` to `gpu_architecture` field name change."""
    if "gpu" in value:
        value["gpu_architecture"] = value["gpu"]
        del value["gpu"]