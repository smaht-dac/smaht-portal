from snovault import abstract_collection, load_schema

from .submitted_item import SubmittedItem


@abstract_collection(
    name="pathology-reports",
    unique_key="submitted_id",
    properties={
        "title": "Pathology Reports",
        "description": "Pathology reports for tissue samples",
    },
)
class PathologyReport(SubmittedItem):
    item_type = "pathology_report"
    base_types = ["PathologyReport"] + SubmittedItem.base_types
    schema = load_schema("encoded:schemas/pathology_report.json")
    embedded_list = []
