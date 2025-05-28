from typing import List, Union

from pyramid.request import Request
from snovault import calculated_property, collection, load_schema

from .donor import Donor
from .base import Item



def _build_protected_donor_embedded_list():
    """Embeds for search on protected donor."""
    return [
        "medical_history.exposures.category",
        "medical_history.exposures.cessation",
        "medical_history.exposures.cessation_duration",
        "medical_history.exposures.duration",
        "medical_history.exposures.frequency_category",
        "medical_history.exposures.quantity",
        "medical_history.exposures.quantity_unit",
        "medical_history.cancer_history",
        "medical_history.cancer_type",
        "medical_history.family_ovarian_pancreatic_prostate_cancer",
        "medical_history.alcohol_use",
        "medical_history.tobacco_use",
    ]


@collection(
    name="protected-donors",
    unique_key="submitted_id",
    properties={
        "title": "Protected Donors",
        "description": "Individuals who donated tissues",
    })
class ProtectedDonor(Donor):
    item_type = "protected_donor"
    base_types = ["ProtectedDonor"] + Donor.base_types
    schema = load_schema("encoded:schemas/protected_donor.json")
    embedded_list = _build_protected_donor_embedded_list()

    class Collection(Item.Collection):
        pass

    rev = {
        "medical_history": ("MedicalHistory", "donor"),
    }

    @calculated_property(
        schema={
            "title": "Medical History",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "MedicalHistory",
            },
        },
    )
    def medical_history(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "medical_history")
        return result or None