from typing import List, Dict, Any

from snovault import collection, load_schema
from snovault.util import debug_log, get_item_or_none
from pyramid.view import view_config
from encoded.validator_decorators import link_related_validator

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
from .sample_source import SampleSource
from ..item_utils import (
    tissue as tissue_utils,
    donor as donor_utils,
    item as item_utils,
    ontology_term as ot_utils,
)

def _build_tissue_embedded_list() -> List[str]:
    return [
        "donor.external_id",
        "uberon_id.identifier",
        "uberon_id.grouping_term",
    ]


@collection(
    name="tissues",
    unique_key="submitted_id",
    properties={
        "title": "Tissues",
        "description": "Tissues collected from an individual",
    },
)
class Tissue(SampleSource):
    item_type = "tissue"
    schema = load_schema("encoded:schemas/tissue.json")
    embedded_list = _build_tissue_embedded_list()

    class Collection(Item.Collection):
        pass


@link_related_validator
def validate_external_id_on_add(context, request):
    """Check that `external_id` matches linked donor `external_id` if Benchmarking or Production tissue on add."""
    data = request.json
    external_id = data['external_id']
    donor = data["donor"]
    donor_item = get_item_or_none(request, donor, 'donors')
    uberon_id = data["uberon_id"]
    uberon_item = get_item_or_none(request, uberon_id, 'ontology-terms')
    if (study := donor_utils.get_study(donor_item)):
        if not assert_external_id_donor_match(external_id, donor_item):
            msg = f"external_id {external_id} does not match Donor external_id {item_utils.get_external_id(donor_item)}."
            return request.errors.add('body', 'Tissue: invalid link', msg)
        if not assert_uberon_id_external_id_match(external_id, uberon_item):
            msg = f"external_id {external_id} does not match valid ids for Uberon ID {item_utils.get_identifier(uberon_item)}:{item_utils.get_display_title(uberon_item)}."
            return request.errors.add('body', 'Tissue: invalid link', msg)
        else:
            return request.validated.update({}) 


@link_related_validator
def validate_external_id_on_edit(context, request):
    """Check that `external_id` matches linked donor `external_id` if Benchmarking or Production tissue on edit."""
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    donor = get_property_for_validation('donor', existing_properties, properties_to_update)
    external_id = get_property_for_validation('external_id', existing_properties, properties_to_update)
    donor_item = get_item_or_none(request, donor, 'sample-sources')
    uberon_id = get_property_for_validation('uberon_id', existing_properties, properties_to_update)
    uberon_item = get_item_or_none(request, uberon_id, 'ontology-terms')
    if (study:=donor_utils.get_study(donor_item)):
        if not assert_external_id_donor_match(external_id, donor_item):
            msg = f"external_id {external_id} does not match Donor external_id {item_utils.get_external_id(donor_item)}."
            return request.errors.add('body', 'Tissue: invalid link', msg)
        if not assert_uberon_id_external_id_match(external_id, uberon_item):
            msg = f"external_id {external_id} does not match valid ids for Uberon ID {item_utils.get_identifier(uberon_item)}:{item_utils.get_display_title(uberon_item)}."
            return request.errors.add('body', 'Tissue: invalid link', msg)
        else:
            return request.validated.update({})
            

def assert_external_id_donor_match(external_id, donor):
    """Check that start of tissue external_id matches donor external_id."""
    donor_id = item_utils.get_external_id(donor)
    tissue_kit_id = tissue_utils.get_donor_id_from_external_id(external_id)
    return donor_id == tissue_kit_id


def assert_uberon_id_external_id_match(external_id: str, uberon_item: Dict[str, Any]):
    """Check that the protocol id of the external_id is in valid_protocol_ids for uberon_id."""
    protocol_id = tissue_utils.get_protocol_id_from_external_id(external_id)
    if (valid_ids := ot_utils.get_valid_protocol_ids(uberon_item)):
        return protocol_id in valid_ids
    return True


TISSUE_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_external_id_on_add
]

@view_config(
    context=Tissue.Collection,
    permission='add',
    request_method='POST',
    validators=TISSUE_ADD_VALIDATORS,
)
@debug_log
def tissue_sample_add(context, request, render=None):
    return collection_add(context, request, render)


TISSUE_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_external_id_on_edit
]

TISSUE_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_external_id_on_edit
]

@view_config(
    context=Tissue,
    permission='edit',
    request_method='PUT',
    validators=TISSUE_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=Tissue,
    permission='edit',
    request_method='PATCH',
    validators=TISSUE_EDIT_PATCH_VALIDATORS,
)
@debug_log
def tissue_sample_edit(context, request, render=None):
    return item_edit(context, request, render)