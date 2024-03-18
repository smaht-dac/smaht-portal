from typing import Any, Dict, List

from snovault import upgrade_step


VARIANT_TYPE_1_2_TRANSLATION = {
    "Copy Number Variant": "CNV",
    "Insertion-deletion": "Indel",
    "Mobile Element Insertion": "MEI",
    "Single Nucleotide Variant": "SNV",
    "Structural Variant": "SV",
}


@upgrade_step("variant_calls", "1", "2")
@upgrade_step("output_file", "1", "2")
@upgrade_step("reference_file", "1", "2")
def upgrade_variant_info_1_2(value: Dict[str, Any], system: Dict[str, Any]) -> None:
    """Update data category and data type for new variant-related enums.

    As variant type now encoded in data type, remove the field.
    """
    data_category = value.get("data_category", [])
    data_type = value.get("data_type", [])
    variant_type = value.get("variant_type", [])
    updated_data_category = get_updated_data_category(data_category, data_type)
    updated_data_type = get_updated_data_type(data_type, variant_type)
    value["data_category"] = updated_data_category
    value["data_type"] = updated_data_type
    if "variant_type" in value:
        del value["variant_type"]


def get_updated_data_category(
    data_category: List[str], data_type: List[str]
) -> List[str]:
    """Update data category based on data type."""
    if "Variant Calls" in data_category:
        return replace_variant_calls(data_category, data_type)
    else:
        return data_category


def replace_variant_calls(data_category: List[str], data_type: List[str]) -> List[str]:
    """Replace 'Variant Calls' option with germline or somatic."""
    updated_data_category = [x for x in data_category if x != "Variant Calls"]
    if "Germline Variants" in data_type:
        updated_data_category.append("Germline Variant Calls")
    elif "Somatic Variants" in data_type:
        updated_data_category.append("Somatic Variant Calls")
    elif not updated_data_category:  # Default to Somatic if cannot determine
        updated_data_category.append("Somatic Variant Calls")
    return updated_data_category


def get_updated_data_type(data_type: List[str], variant_type: List[str]) -> List[str]:
    """Update data type.

    Remove germline/somatic distinction and ensure all variant type
    information is included in abbreviated form.
    """
    enums_to_drop = [
        "Germline Variants",
        "Somatic Variants",
        "Germline Variant Calls",
        "Somatic Variant Calls",
    ]
    updated_data_type = [
        VARIANT_TYPE_1_2_TRANSLATION.get(value, value) for value in data_type
        if value not in enums_to_drop
    ]
    for value in variant_type:
        translated_value = VARIANT_TYPE_1_2_TRANSLATION.get(value, value)
        if translated_value not in updated_data_type:
            updated_data_type.append(translated_value)
    return updated_data_type
