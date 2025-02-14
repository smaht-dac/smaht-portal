from snovault import collection, load_schema

from .pathology_report import PathologyReport


@collection(
    name="non-brain-pathology-reports",
    unique_key="submitted_id",
    properties={
        "title": "Non-Brain Pathology Reports",
        "description": "Pathology reports for non-brain tissue samples",
    },
)
class NonBrainPathologyReport(PathologyReport):
    item_type = "non_brain_pathology_report"
    schema = load_schema("encoded:schemas/non_brain_pathology_report.json")
    embedded_list = []
