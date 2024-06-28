from typing import Union, List
from snovault import collection, load_schema, calculated_property
from pyramid.request import Request

from .submitted_item import SubmittedItem
from .reference_genome import ReferenceGenome


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
class DonorSpecificAssembly(SubmittedItem, ReferenceGenome):
    item_type = "donor_specific_assembly"
    base_types = ["ReferenceGenome"] + SubmittedItem.base_types
    schema = load_schema("encoded:schemas/donor_specific_assembly.json")
    embedded_list = _build_dsa_embedded_list()

    rev = {
        "files": ("SupplementaryFile", "donor_specific_assembly"),
    }

    @calculated_property(
        schema={
            "title": "Files",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "SupplementaryFile",
            },
        },
    )
    def files(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "files")
        if result:
            return result
        return
