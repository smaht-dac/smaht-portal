from typing import Iterable, List, Optional, Union

from pyramid.request import Request
from snovault import calculated_property, collection

from .base import SMAHTItem, load_smaht_schema
from .utils import CENTER_SUBMITTER_IDS_SCHEMA, get_unique_center_submitter_ids


@collection(
    name="biosamples",
    unique_key="accession",
    properties={"title": "Biosamples", "description": "Listing of biosamples"},
)
class Biosample(SMAHTItem):
    item_type = "biosample"
    schema = load_smaht_schema(item_type)
    rev = {
        "analytes": ("Analyte", "biosample"),
        "child_biosamples": ("Biosample", "parent_biosamples"),
    }

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
            "title": "Analytes",
            "description": "Analytes for this biosample",
            "type": "array",
            "items": {
                "title": "Analyte",
                "type": "string",
                "linkTo": "Analyte",
            },
        }
    )
    def analytes(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "analytes")
        if result:
            return result

    @calculated_property(
        schema={
            "title": "Child Biosamples",
            "description": "Biosamples derived from this biosample",
            "type": "array",
            "items": {
                "title": "Biosample",
                "type": "string",
                "linkTo": "Biosample",
            },
        }
    )
    def child_biosamples(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "child_biosamples")
        if result:
            return result
