from typing import Any, Dict

from snovault import upgrade_step

from .file import get_updated_data_category, get_updated_data_type


@upgrade_step("meta_workflow", "1", "2")
def upgrade_meta_workflow_1_2(value: Dict[str, Any], system: Dict[str, Any]) -> None:
    """Upgrade MetaWorkflow for breaking changes to `custom_pf_fields`.

    `data_category` and `data_type` on File had enum changes while `variant_type`
    was removed, so same changes need to go into `custom_pf_fields`.
    """
    updated_workflows = [
        get_updated_workflow(workflow) for workflow in value.get("workflows", [])
    ]
    if updated_workflows:
        value["workflows"] = updated_workflows


def get_updated_workflow(workflow: Dict[str, Any]) -> Dict[str, Any]:
    """Update custom_pf_fields for a workflow, if needed."""
    custom_pf_fields = workflow.get("custom_pf_fields", {})
    if custom_pf_fields:
        updated_custom_pf_fields = get_updated_custom_pf_fields(custom_pf_fields)
        return {**workflow, "custom_pf_fields": updated_custom_pf_fields}
    return {**workflow}


def get_updated_custom_pf_fields(
    custom_pf_fields: Dict[str, Dict[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    """Update custom_pf_fields for breaking file changes."""
    return {
        key: get_updated_custom_pf_field_values(value)
        for key, value in custom_pf_fields.items()
    }


def get_updated_custom_pf_field_values(value: Dict[str, Any]) -> Dict[str, Any]:
    """Update custom_pf_field values for breaking file changes."""
    data_category = value.get("data_category", [])
    data_type = value.get("data_type", [])
    variant_type = value.get("variant_type", [])
    updated_data_category = get_updated_data_category(data_category, data_type)
    updated_data_type = get_updated_data_type(data_type, variant_type)
    keys_to_remove = ["data_category", "data_type", "variant_type"]
    unchanged_items = {
        key: value for key, value in value.items() if key not in keys_to_remove
    }
    return {
        **unchanged_items,
        "data_category": updated_data_category,
        "data_type": updated_data_type,
    }
