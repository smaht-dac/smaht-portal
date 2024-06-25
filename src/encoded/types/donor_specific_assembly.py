from typing import List, Union

from pyramid.request import Request
from snovault import calculated_property, collection, load_schema
from .submitted_item import SubmittedItem


def _build_dsa_embedded_list():
    """Embeds for search on general files."""
    return SubmittedItem.embedded_list


@collection(
    name="donor-specific-assemblies",
    unique_key="submitted_id",
    properties={
        "title": "Donor Specific Assembly",
        "description": "Donor-specific assembly",
    },
)
class DonorSpecificAssembly(SubmittedItem):
    item_type = "donor_specific_assembly"
    schema = load_schema("encoded:schemas/donor_specific_assembly.json")
    embedded_list = _build_dsa_embedded_list()

    rev = {"files": ("GeneralFile", "donor_specific_assembly")}

    @calculated_property(
        schema={
            "title": "Files",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "GeneralFile",
            },
        },
    )
    def files(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "files")
        if result:
            return result
        return
