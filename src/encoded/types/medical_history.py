from typing import Union, List

from snovault import collection, load_schema, calculated_property
from pyramid.request import Request

from .submitted_item import SubmittedItem


@collection(
    name="medical-histories",
    unique_key="submitted_id",
    properties={
        "title": "Medical Histories",
        "description": "Medical histories for donors",
    },
)
class MedicalHistory(SubmittedItem):
    item_type = "medical_history"
    schema = load_schema("encoded:schemas/medical_history.json")
    embedded_list = []

    rev = {
        "diagnosis": ("Diagnosis", "medical_history"),
        "exposure": ("Exposure", "medical_history"),
        "medical_treatment": ("MedicalTreatment", "medical_history"),
    }

    @calculated_property(
        schema={
            "title": "Diagnosis",
            "description": "Diagnoses included in the medical history of the donor",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "Diagnosis"
            }
        },
    )
    def diagnosis(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "diagnosis")
        if result:
            return result
        return
    
    @calculated_property(
        schema={
            "title": "Exposure",
            "description": "Exposures included in the medical history of the donor",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "Exposure"
            }
        },
    )
    def exposure(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "exposure")
        if result:
            return result
        return
    
    @calculated_property(
        schema={
            "title": "Medical Treatment",
            "description": "Medical treatments included in the medical history of the donor",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "MedicalTreatment"
            }
        },
    )
    def medical_treatment(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "medical_treatment")
        if result:
            return result
        return
