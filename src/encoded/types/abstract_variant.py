from typing import List, Union

from pyramid.request import Request
from copy import deepcopy
from pyramid.view import view_config
from snovault import calculated_property, abstract_collection, load_schema
from snovault.util import debug_log

# will variant items ever be submitted
# from .submitted_item import SubmittedItem

from .base import (
    collection_add,
    item_edit,
    Item
)
from .utils import (
    get_properties,
    get_property_for_validation,
)
#from .submitted_item import (
#    SUBMITTED_ITEM_ADD_VALIDATORS,
#    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
#    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
#)
from ..item_utils import (
    variant as variant_utils
)

def _build_abstract_variant_embedded_list():
    """Embeds for search on abstract variant."""
    return []


class AbstractVariantCollection(Item.Collection):
    pass


@abstract_collection(
    name="abstract-variants",
    unique_key="submitted_id",
    properties={
        "title": "Abstract Variants",
        "description": "Individuals who donated tissues",
    }
)
class AbstractVariant(SubmittedItem):
    item_type = "abstract_variant"
    base_types = ["AbstractVariant"] + SubmittedItem.base_types
    schema = load_schema("encoded:schemas/abstract_variant.json")
    embedded_list = _build_abstract_variant_embedded_list()

    Collection = AbstractVariantCollection

    # Overrides here necessary for referencing purposes downstream - Will Jul 8 25
    SUBMISSION_CENTER_STATUS_ACL = deepcopy(SubmittedItem.SUBMISSION_CENTER_STATUS_ACL)
    CONSORTIUM_STATUS_ACL = deepcopy(SubmittedItem.CONSORTIUM_STATUS_ACL)

    @calculated_property(
        schema={
            "title": "Study",
            "type": "string",
        },
    )
    def study(self, request: Request) -> Union[List[str], None]:
        """Get whether the variant is a Benchmarking or Production variant."""
        return variant_utils.get_study(self.properties) or None


def validate_external_id_on_add(context, request):
    """Check that external_id is valid if it is a TPC-submitted variant on add."""
    data = request.json
    external_id = data['external_id']
    if variant_utils.is_tpc_submitted(data):
        if not assert_valid_external_id(external_id):
            msg = f"external_id {external_id} does not match TPC variant nomenclature."
            return request.errors.add('body', f"{context.type_info.name}: invalid property", msg)
        else:
            return request.validated.update({})


def validate_external_id_on_edit(context, request):
    """Check that external_id is valid if it is a TPC-submitted variant on edit."""
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    tpc_submitted = get_property_for_validation('tpc_submitted', existing_properties, properties_to_update)
    external_id = get_property_for_validation('external_id', existing_properties, properties_to_update)
    if tpc_submitted == "True":
        if not assert_valid_external_id(external_id):
            msg = f"external_id {external_id} does not match TPC variant nomenclature."
            return request.errors.add('body', f"{context.type_info.name}: invalid property", msg)
        else:
            return request.validated.update({})


def assert_valid_external_id(external_id: str):
    """Check if variant external_id matches Benchmarking or Production."""
    return variant_utils.is_valid_external_id(external_id)


ABSTRACT_DONOR_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_external_id_on_add
]

@view_config(
    context=AbstractVariant.Collection,
    permission='add',
    request_method='POST',
    validators=ABSTRACT_DONOR_ADD_VALIDATORS,
)
@debug_log
def abstract_variant_add(context, request, render=None):
    return collection_add(context, request, render)


ABSTRACT_DONOR_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_external_id_on_edit
]

ABSTRACT_DONOR_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_external_id_on_edit
]

@view_config(
    context=AbstractVariant,
    permission='edit',
    request_method='PUT',
    validators=ABSTRACT_DONOR_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=AbstractVariant,
    permission='edit',
    request_method='PATCH',
    validators=ABSTRACT_DONOR_EDIT_PATCH_VALIDATORS,
)
@debug_log
def abstract_variant_edit(context, request, render=None):
    return item_edit(context, request, render)