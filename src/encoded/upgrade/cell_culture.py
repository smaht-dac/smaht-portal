from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("cell_culture", "1", "2")
def upgrade_cell_culture_1_2(value: Dict[str, Any], system: Dict[str, Any]) -> None:
    """Upgrade lot number from string to list of strings."""
    existing_lot_number = value.get("lot_number")
    if existing_lot_number:
        value["lot_number"] = [existing_lot_number]
    elif existing_lot_number is not None:
        del value["lot_number"]
