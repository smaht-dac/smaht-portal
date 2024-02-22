from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("sequencing", "1", "2")
def upgrade_sequencing_1_2(value: Dict[str, Any], system: Dict[str, Any]) -> None:
    """Remove fields now placed on Sequencer item."""
    if "platform" in value:
        del value["platform"]
    if "instrument_model" in value:
        del value["instrument_model"]
