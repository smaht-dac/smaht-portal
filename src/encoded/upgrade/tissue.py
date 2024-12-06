from typing import Any, Dict

from snovault import upgrade_step


@upgrade_step("tissue", "1", "2")
def upgrade_tissue_1_2(value: Dict[str, Any], system: Dict[str, Any]) -> Dict[str, Any]:
    existing_location = value.get("location")
    if existing_location:
        value["anatomical_location"] = existing_location
        del value["location"]


@upgrade_step("tissue", "2", "3")
def upgrade_tissue_2_3(value: Dict[str, Any], system: Dict[str, Any]) -> Dict[str, Any]:
    existing_recovery_interval = value.get("recovery_interval")
    if existing_recovery_interval:
        del value["recovery_interval"]


@upgrade_step("tissue", "3", "4")
def upgrade_tissue_3_4(value: Dict[str, Any], system: Dict[str, Any]) -> Dict[str, Any]:
    existing_recovery_datetime = value.get("recovery_datetime")
    if existing_recovery_datetime:
        del value["recovery_datetime"]
