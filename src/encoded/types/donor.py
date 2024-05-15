from typing import List, Union

from pyramid.request import Request
from snovault import calculated_property, collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="donors",
    unique_key="submitted_id",
    properties={
        "title": "Donors",
        "description": "Individuals who donated tissues",
    })
class Donor(SubmittedItem):
    item_type = "donor"
    schema = load_schema("encoded:schemas/donor.json")
    embedded_list = []
    rev = {
        "tissues": ("Tissue", "donor"),
    }

    @calculated_property(
        schema={
            "title": "Tissues",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "Tissue",
            },
        },
    )
    def tissues(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "tissues")
        if result:
            return result
        return
