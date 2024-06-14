from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("tissue", "1", "2")
def upgrade_tissue_1_2(value: Dict[str, Any], system: Dict[str, Any]) -> Dict[str, Any]:
    existing_location = value.get("location")
    if existing_location:
        value["anatomical_location"] = existing_location
        del value["location"]
