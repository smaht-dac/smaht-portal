from typing import List, Union

from pyramid.request import Request
from snovault import calculated_property, collection, load_schema

from .abstract_donor import AbstractDonor


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
        "medical_history.family_breast_cancer",
        "medical_history.family_cancer_under_50",
        "medical_history.family_ovarian_pancreatic_prostate_cancer",
        "medical_history.alcohol_use",
        "medical_history.tobacco_use",
    ]


@collection(
    name="protected-donors",
    unique_key="submitted_id",
    properties={
        "title": "Protected Donors",
        "description": "Individuals who donated tissues with protected data",
    })
class ProtectedDonor(AbstractDonor):
    item_type = "protected_donor"
    schema = load_schema("encoded:schemas/protected_donor.json")
    embedded_list = _build_protected_donor_embedded_list()

    rev = {
        "donor": ("Donor", "protected_donor"),
        "medical_history": ("MedicalHistory", "donor"),
    }

    @calculated_property(
        schema={
            "title": "Public Donor",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "Donor",
            },
        },
    )
    def donor(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "donor")
        return result or None

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