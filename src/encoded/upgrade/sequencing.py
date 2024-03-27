from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("sequencing", "1", "2")
def upgrade_sequencing_1_2(value: Dict[str, Any], system: Dict[str, Any]) -> None:
    """Remove fields now placed on Sequencer item."""
    if "platform" in value:
        del value["platform"]
    if "instrument_model" in value:
        del value["instrument_model"]


@upgrade_step("sequencing", "2", "3")
def upgrade_sequencing_2_3(value: Dict[str, Any], system: Dict[str, Any]) -> None:
    """Handle `flowcell` to `flow_cell` field name change."""
    if "flowcell" in value:
        value["flow_cell"] = value["flowcell"]
        del value["flowcell"]
