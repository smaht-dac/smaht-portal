from snovault import collection, load_schema
from snovault.util import debug_log, get_item_or_none

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

from ..item_utils import (
    item as item_utils,
    assay as assay_utils,
    analyte as analyte_utils
)

ASSAY_DEPENDENT = {
    "target_monomer_size": ["bulk_mas_iso_seq"]
}

def _build_library_embedded_list():
    """Embeds for search on libraries."""
    return []


@collection(
    name="libraries",
    unique_key="submitted_id",
    properties={
        "title": "Libraries",
        "description": "Sequencing libraries",
    },
)
class Library(SubmittedItem):
    item_type = "library"
    schema = load_schema("encoded:schemas/library.json")
    embedded_list = _build_library_embedded_list()

    class Collection(Item.Collection):
        pass

def validate_molecule_specific_assay(context, request):
    """Check that analyte.molecule includes the correct molecule for molecule-specific assays.
    
    The assays with `valid_molecules` property may need to be updated as new techologies come out 
    or are added to the portal.
    """
    data = request.json
    molecules = []
    for analyte in data['analytes']:
        molecules += analyte_utils.get_molecule(
            get_item_or_none(request, analyte, 'analytes')
        )
    assay = get_item_or_none(request, data['assay'], 'assays')
    valid_molecules = assay_utils.get_valid_molecules(assay)
    if valid_molecules:
        overlap = list(set(molecules) & set(valid_molecules))
        if not overlap:
            msg = f"Assay {assay} is specific to molecules: {valid_molecules}."
            return request.errors.add('body', 'Library: invalid links', msg)
    return request.validated.update({})
    

def validate_assay_specific_properties(context, request):
    """Check that assay is appropriate for assay-specific properties.
    
    Assay-specific properties are in `ASSAY_DEPENDENT`
    """
    data = request.json
    if 'assay' in data:
        for property in ASSAY_DEPENDENT.keys():
            if property in data:
                assay = item_utils.get_identifier(
                    get_item_or_none(request, data['assay'], 'assays')
                )
                if assay not in ASSAY_DEPENDENT[property]:
                    msg = f"Property {property} not compatible with assay {assay}. Valid for assays {', '.join(ASSAY_DEPENDENT[property])}"
                    return request.errors.add('body', 'Library: invalid property value', msg)
        return request.validated.update({})


LIBRARY_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_molecule_specific_assay,
    validate_assay_specific_properties
]

@view_config(
    context=Library.Collection,
    permission='add',
    request_method='POST',
    validators=LIBRARY_ADD_VALIDATORS,
)
@debug_log
def library_add(context, request, render=None):
    return collection_add(context, request, render)


LIBRARY_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_molecule_specific_assay,
    validate_assay_specific_properties
]

LIBRARY_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_molecule_specific_assay,
    validate_assay_specific_properties
]

@view_config(
    context=Library,
    permission='edit',
    request_method='PUT',
    validators=LIBRARY_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=Library,
    permission='edit',
    request_method='PATCH',
    validators=LIBRARY_EDIT_PATCH_VALIDATORS,
)
@debug_log
def library_edit(context, request, render=None):
    return item_edit(context, request, render)