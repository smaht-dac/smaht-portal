from snovault import collection, load_schema

from .pathology_report import PathologyReport


@collection(
    name="brain-pathology-reports",
    unique_key="submitted_id",
    properties={
        "title": "Brain Pathology Reports",
        "description": "Pathology reports for brain tissue samples",
    },
)
class BrainPathologyReport(PathologyReport):
    item_type = "brain_pathology_report"
    schema = load_schema("encoded:schemas/brain_pathology_report.json")
    embedded_list = []
