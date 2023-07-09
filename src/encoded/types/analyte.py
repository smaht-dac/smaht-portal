from typing import List, Union

from pyramid.request import Request
from snovault import calculated_property, collection

from .base import SMAHTItem, load_smaht_schema


@collection(
    name="analytes",
    unique_key="accession",
    properties={"title": "Analytes", "description": "Listing of analytes"},
)
class Analyte(SMAHTItem):
    item_type = "analyte"
    schema = load_smaht_schema(item_type)
    rev = {"aliquots": ("Aliquot", "analyte")}

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
