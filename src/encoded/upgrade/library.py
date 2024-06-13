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


@upgrade_step("library", "2", "3")
def upgrade_library_2_3(
    value: Dict[str, Any], system: Dict[str, Any]
) -> Dict[str, Any]:
    """Delete fragment_maximimum_length, fragment_mean_length, 
    fragment_minimum_length, fragment_standard_deviation_length,
    insert_coefficient_of_variation, insert_maximum_length,
    insert_mean_length, insert_minimum_length, insert_standard_deviation_length,
    target_insert_maximum_length, target_insert_mean_length, target_insert_maximum_length."""

    removed_properties = ["fragment_minimum_length", "fragment_standard_deviation_length",
    "insert_coefficient_of_variation", "insert_maximum_length",
    "insert_mean_length", "insert_minimum_length", "insert_standard_deviation_length",
    "target_insert_maximum_length", "target_insert_mean_length", "target_insert_maximum_length"]
    for property in removed_properties:
        if property in value:
            del value[property]