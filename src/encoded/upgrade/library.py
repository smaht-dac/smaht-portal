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
    """Delete properties in `removed_properties` from library.

    Handle `target_mean_insert_length` to `target_fragment_size`
    name change.
    """

    removed_properties = [
        "fragment_minimum_length",
        "fragment_maximum_length",
        "fragment_standard_deviation_length",
        "insert_standard_deviation_length",
    ]
    for property in removed_properties:
        if property in value:
            del value[property]

    if "target_insert_mean_length" in value:
        value["target_fragment_size"] = value["target_insert_mean_length"]
        del value["target_insert_mean_length"]
