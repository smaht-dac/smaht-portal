from typing import List, Union

from pyramid.request import Request
from snovault import abstract_collection, load_schema, calculated_property

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

    rev = {
        "histology_images": ("HistologyImage", "pathology_reports")
    }

    @calculated_property(
        schema={
            "title": "Histology Images",
            "description": "Histology images referencing this pathology report",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "HistologyImage",
            },
        },
    )
    def histology_images(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "histology_images")
        if result:
            return result
        return
