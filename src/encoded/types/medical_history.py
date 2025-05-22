from typing import List, Union

from snovault import collection, load_schema, calculated_property
from pyramid.request import Request

from .submitted_item import SubmittedItem
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
        "exposures": ("Exposure", "medical_history")
    }

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
        """Revlink of Exposures with category of Alcohol or Tobacco."""
        result = self.rev_link_atids(request, "exposures")
        request_handler = RequestHandler(request = request)
        categories = ["Alcohol", "Tobacco"]
        valid_exposures = [ 
            exp for exp in result
            if get_property_value_from_identifier(
                request_handler,
                exp,
                exposure_utils.get_category
            ) in categories
        ]
        return valid_exposures or None

