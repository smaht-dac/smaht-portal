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


def validate_rna_molecule_properties(context,request):
    """Check that `molecule` contains RNA if RNA-specific properties have values."""

    rna_properties = [
        'rna_integrity_number',
        'rna_integrity_number_instrument',
        'ribosomal_rna_ratio'
    ]
    molecule = 'RNA'
    data = request.json
    if 'molecule' in data:
        if molecule not in data['molecule']:
            for property in rna_properties:
                if data.get(property,""):
                    msg = f"Property {property} is specific to molecule {molecule}."
                    return request.errors.add('body', 'Analyte: invalid property values', msg)
                else:
                    return request.validated.update({})
        return request.validated.update({})


ANALYTE_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_rna_molecule_properties
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
    validate_rna_molecule_properties
]

ANALYTE_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_rna_molecule_properties
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