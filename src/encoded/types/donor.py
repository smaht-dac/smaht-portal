from typing import List, Union

from pyramid.request import Request
from snovault import collection, load_schema, calculated_property

from .abstract_donor import AbstractDonor


def _build_donor_embedded_list():
    """Embeds for search on donor."""
    return [
        'tissues.uberon_id.display_title',
        'tissues.uberon_id.identifier',
    ]


@collection(
    name="donors",
    unique_key="submitted_id",
    properties={
        "title": "Donors",
        "description": "Individuals who donated tissues",
    })
class Donor(AbstractDonor):
    item_type = "donor"
    schema = load_schema("encoded:schemas/donor.json")
    embedded_list = _build_donor_embedded_list()

    rev = {
        "tissues": ("Tissue", "donor")
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
