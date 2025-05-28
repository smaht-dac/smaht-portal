from typing import List, Union

from pyramid.request import Request
from pyramid.view import view_config
from snovault import calculated_property, abstract_collection, load_schema
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

def _build_abstract_donor_embedded_list():
    """Embeds for search on abstract donor."""
    return []


class AbstractDonorCollection(Item.Collection):
    pass


@abstract_collection(
    name="abstract-donors",
    unique_key="submitted_id",
    properties={
        "title": "Abstract Donors",
        "description": "Individuals who donated tissues",
    }
)
class AbstractDonor(SubmittedItem):
    item_type = "abstract_donor"
    base_types = ["AbstractDonor"] + SubmittedItem.base_types
    schema = load_schema("encoded:schemas/abstract_donor.json")
    embedded_list = _build_abstract_donor_embedded_list()

    Collection = AbstractDonorCollection

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


ABSTRACT_DONOR_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_external_id_on_add
]

@view_config(
    context=AbstractDonor.Collection,
    permission='add',
    request_method='POST',
    validators=ABSTRACT_DONOR_ADD_VALIDATORS,
)
@debug_log
def abstract_donor_add(context, request, render=None):
    return collection_add(context, request, render)


ABSTRACT_DONOR_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_external_id_on_edit
]

ABSTRACT_DONOR_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_external_id_on_edit
]

@view_config(
    context=AbstractDonor,
    permission='edit',
    request_method='PUT',
    validators=ABSTRACT_DONOR_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=AbstractDonor,
    permission='edit',
    request_method='PATCH',
    validators=ABSTRACT_DONOR_EDIT_PATCH_VALIDATORS,
)
@debug_log
def abstract_donor_edit(context, request, render=None):
    return item_edit(context, request, render)