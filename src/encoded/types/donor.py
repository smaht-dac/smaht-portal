from typing import List, Union

from pyramid.request import Request
from pyramid.view import view_config
from snovault import calculated_property, collection, load_schema
from snovault.util import debug_log

from .submitted_item import SubmittedItem

from .base import (
    collection_add,
    item_edit,
    Item
)
from .utils import (
    get_properties,
    get_property_for_validation,
)
from .submitted_item import (
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
)
from ..item_utils import (
    donor as donor_utils
)

def _build_donor_embedded_list():
    """Embeds for search on libraries."""
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
    name="donors",
    unique_key="submitted_id",
    properties={
        "title": "Donors",
        "description": "Individuals who donated tissues",
    })
class Donor(SubmittedItem):
    item_type = "donor"
    schema = load_schema("encoded:schemas/donor.json")
    embedded_list = _build_donor_embedded_list()

    class Collection(Item.Collection):
        pass

    rev = {
        "tissues": ("Tissue", "donor"),
        "medical_history": ("MedicalHistory", "donor"),
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
        if result:
            return result
        return


def validate_external_id_on_add(context, request):
    """Check that external_id is valid if it is a TPC-submitted donor on add."""
    data = request.json
    external_id = data['external_id']
    if donor_utils.is_tpc_submitted(data):
        if not assert_valid_external_id(external_id):
            msg = f"external_id {external_id} does not match TPC donor nomenclature."
            return request.errors.add('body', 'Donor: invalid property', msg)
        else:
            return request.validated.update({})


def validate_external_id_on_edit(context, request):
    """Check that external_id is valid if it is a TPC-submitted donor on edit."""
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    tpc_submitted = get_property_for_validation('tpc_submitted', existing_properties, properties_to_update)
    external_id = get_property_for_validation('external_id', existing_properties, properties_to_update)
    if tpc_submitted == "True":
        if not assert_valid_external_id(external_id):
            msg = f"external_id {external_id} does not match TPC donor nomenclature."
            return request.errors.add('body', 'Donor: invalid property', msg)
        else:
            return request.validated.update({}) 


def assert_valid_external_id(external_id: str):
    """Check if donor external_id matches Benchmarking or Production."""
    return donor_utils.is_valid_external_id(external_id)


DONOR_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_external_id_on_add
]

@view_config(
    context=Donor.Collection,
    permission='add',
    request_method='POST',
    validators=DONOR_ADD_VALIDATORS,
)
@debug_log
def donor_add(context, request, render=None):
    return collection_add(context, request, render)


DONOR_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_external_id_on_edit
]

DONOR_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_external_id_on_edit
]

@view_config(
    context=Donor,
    permission='edit',
    request_method='PUT',
    validators=DONOR_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=Donor,
    permission='edit',
    request_method='PATCH',
    validators=DONOR_EDIT_PATCH_VALIDATORS,
)
@debug_log
def donor_edit(context, request, render=None):
    return item_edit(context, request, render)