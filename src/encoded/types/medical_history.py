from typing import List, Union
from copy import deepcopy

from snovault import collection, load_schema, calculated_property
from pyramid.request import Request

from .submitted_item import SubmittedItem
from .acl import ONLY_DBGAP_VIEW_ACL, ONLY_PUBLIC_DBGAP_VIEW_ACL
from ..item_utils.utils import (
    get_property_value_from_identifier,
    RequestHandler,
)
from ..item_utils import exposure as exposure_utils


def _build_medical_history_embedded_list():
    """Embeds for search on medical history."""
    return []


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
    embedded_list = _build_medical_history_embedded_list()

    rev = {
        "exposures": ("Exposure", "medical_history"),
        "diagnoses": ("Diagnosis", "medical_history"),
        "medical_treatments": ("MedicalTreatment", "medical_history")
    }

    class Collection(SubmittedItem.Collection):
        pass

    SUBMISSION_CENTER_STATUS_ACL = deepcopy(SubmittedItem.SUBMISSION_CENTER_STATUS_ACL)
    SUBMISSION_CENTER_STATUS_ACL.update({
        'protected-network': ONLY_DBGAP_VIEW_ACL,
        'protected': ONLY_PUBLIC_DBGAP_VIEW_ACL
    })
    CONSORTIUM_STATUS_ACL = deepcopy(SubmittedItem.CONSORTIUM_STATUS_ACL)
    CONSORTIUM_STATUS_ACL.update({
        'protected-network': ONLY_DBGAP_VIEW_ACL,
        'protected': ONLY_PUBLIC_DBGAP_VIEW_ACL
    })

    @calculated_property(
        schema={
            "title": "Exposures",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "Exposure",
            },
        },
    )
    def exposures(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "exposures")
        return result or None

    @calculated_property(
        schema={
            "title": "Diagnoses",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "Diagnosis",
            },
        },
    )
    def diagnoses(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "diagnoses")
        return result or None

    @calculated_property(
        schema={
            "title": "Medical Treatments",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "MedicalTreatment",
            },
        },
    )
    def medical_treatments(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "medical_treatments")
        return result or None
