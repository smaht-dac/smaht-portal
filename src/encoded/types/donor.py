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
        "death_circumstances": ("DeathCircumstances", "donor"),
        "demographic": ("Demographic", "donor"),
        "family_history": ("FamilyHistory", "donor"),
        "medical_history": ("MedicalHistory", "donor"),
        "tissues": ("Tissue", "donor"),
        "tissue_collection": ("TissueCollection", "donor")
    }

    @calculated_property(
        schema={
            "title": "Death Circumstances",
            "description": "Circumstances of death of the donor",
            "type": "string",
            "linkTo": "DeathCircumstances"
        },
    )
    def death_circumstances(self, request: Request) -> Union[str, None]:
        result = self.rev_link_atids(request, "death_circumstances")
        if result:
            return result
        return
    
    @calculated_property(
        schema={
            "title": "Demographic",
            "description": "Demographic information for the donor",
            "type": "string",
            "linkTo": "Demographic"
        },
    )
    def demographic(self, request: Request) -> Union[str, None]:
        result = self.rev_link_atids(request, "demographic")
        if result:
            return result
        return
    
    @calculated_property(
        schema={
            "title": "Family History",
            "description": "Family history of the donor",
            "type": "string",
            "linkTo": "FamilyHistory"
        },
    )
    def family_history(self, request: Request) -> Union[str, None]:
        result = self.rev_link_atids(request, "family_history")
        if result:
            return result
        return
    
    @calculated_property(
        schema={
            "title": "Medical History",
            "description": "Medical history of the donor",
            "type": "string",
            "linkTo": "MedicalHistory"
        },
    )
    def medical_history(self, request: Request) -> Union[str, None]:
        result = self.rev_link_atids(request, "medical_history")
        if result:
            return result
        return
    
    @calculated_property(
        schema={
            "title": "Tissues",
            "description": "Tissues collected from the donor",
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
    
    @calculated_property(
        schema={
            "title": "Tissue Collection",
            "description": "Tissue collection information for the donor",
            "type": "string",
            "linkTo": "TissueCollection"
        },
    )
    def tissue_collection(self, request: Request) -> Union[str, None]:
        result = self.rev_link_atids(request, "tissue_collection")
        if result:
            return result
        return
    
    
