from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("cell_culture", "1", "2")
def cell_culture_1_2(value: Dict[str, Any], system: None) -> None:
    """Convert lot number from integer to array of string."""
    upgrade_lot_number(value)


def upgrade_lot_number(value: Dict[str, Any]) -> None:
    """Convert lot number from integer to array of string."""
    lot_number = value.get("lot_number")
    if lot_number:
        value["lot_number"] = [str(lot_number)]
