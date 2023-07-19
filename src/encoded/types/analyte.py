from typing import Iterable, List, Optional, Union

from pyramid.request import Request
from snovault import calculated_property, collection

from .base import SMAHTItem, load_smaht_schema
from .utils import CENTER_SUBMITTER_IDS_SCHEMA, get_unique_center_submitter_ids


@collection(
    name="analytes",
    unique_key="accession",
    properties={"title": "Analytes", "description": "Listing of analytes"},
)
class Analyte(SMAHTItem):
    item_type = "analyte"
    schema = load_smaht_schema(item_type)
    rev = {"aliquots": ("Aliquot", "analyte")}

    @calculated_property(schema=CENTER_SUBMITTER_IDS_SCHEMA)
    def center_submitter_ids(
        self,
        request: Request,
        submitter_id: Optional[str] = None,
        submission_centers: Optional[Iterable[str]] = None,
    ) -> Union[List[str], None]:
        if submitter_id and submission_centers:
            return get_unique_center_submitter_ids(submitter_id, submission_centers, request)
        return

    @calculated_property(
        schema={
            "title": "Aliquots",
            "description": "Aliquots for this analyte",
            "type": "array",
            "items": {
                "title": "Aliquot",
                "type": "string",
                "linkTo": "Aliquot",
            },
        }
    )
    def aliquots(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "aliquots")
        if result:
            return result
