import re
from typing import Dict, List, Any
from snovault import collection, load_schema
from snovault.util import debug_log

from pyramid.view import view_config

from .submitted_item import (
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
    SubmittedItem,
)

from .base import (
    collection_add,
    item_edit,
    Item
)
from .utils import get_properties, get_property_for_validation

from ..item_utils import (
    analyte as analyte_utils
)

@collection(
    name="analytes",
    unique_key="submitted_id",
    properties={
        "title": "Analytes",
        "description": "Molecules extracted from samples for subsequent analysis",
    },
)
class Analyte(SubmittedItem):
    item_type = "analyte"
    schema = load_schema("encoded:schemas/analyte.json")
    embedded_list = []

    class Collection(Item.Collection):
        pass


def validate_molecule_specific_properties_on_add(context,request):
    """Check that `molecule` is compatible with molecule-specific properties on add."""
    data = request.json
    molecules = ['DNA','RNA']

    for molecule in molecules:
        if molecule not in data['molecule']:
            specific_properties = [ key for key in data.keys() if re.match(f"{molecule.lower()}",key) ]
            if specific_properties:
                msg = f"Property {specific_properties} is specific to molecule {molecule}."
                return request.errors.add('body', 'Analyte: invalid property values', msg)
    return request.validated.update({})


def validate_molecule_specific_properties_on_edit(context,request):
    """Check that `molecule` is compatible with molecule-specific properties on edit."""
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    all_property_keys = list(set().union(existing_properties.keys(), properties_to_update.keys()))
    molecules = get_property_for_validation('molecule', existing_properties, properties_to_update)
    for molecule in ['DNA','RNA']:
        if molecule not in molecules:
            specific_properties = [ key for key in all_property_keys if molecule.lower() in key ]
            if specific_properties:
                msg = f"Property {specific_properties} is specific to molecule {molecule}."
                return request.errors.add('body', 'Analyte: invalid property values', msg)
    return request.validated.update({})


ANALYTE_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_molecule_specific_properties_on_add
]

@view_config(
    context=Analyte.Collection,
    permission='add',
    request_method='POST',
    validators=ANALYTE_ADD_VALIDATORS,
)
@debug_log
def analyte_add(context, request, render=None):
    return collection_add(context, request, render)


ANALYTE_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_molecule_specific_properties_on_edit
]

ANALYTE_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_molecule_specific_properties_on_edit
]

@view_config(
    context=Analyte,
    permission='edit',
    request_method='PUT',
    validators=ANALYTE_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=Analyte,
    permission='edit',
    request_method='PATCH',
    validators=ANALYTE_EDIT_PATCH_VALIDATORS,
)
@debug_log
def analyte_edit(context, request, render=None):
    return item_edit(context, request, render)