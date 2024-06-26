from typing import Any, Dict
from snovault import load_schema


def get_schema(type) -> Dict[str, Any]:
    """Load schema from file."""
    return load_schema(f"encoded:schemas/{type}.json")


def test_common_fields():
    """
    Make sure all common fields defined in the MetaworkflowRun schema are present
    in workflow_run, quality_metric and file
    """

    # items that require common_field properties
    items_to_check = ["workflow_run", "quality_metric", "file"]

    meta_workflow_run = get_schema("meta_workflow_run")
    common_fields = meta_workflow_run["properties"]["common_fields"]["properties"]
    common_fields_list = list(common_fields.keys())

    for item in items_to_check:
        item_schema = get_schema(item)
        item_props = item_schema["properties"]
        item_props_list = list(item_props.keys())
        for common_field in common_fields_list:
            assert common_field in item_props_list


