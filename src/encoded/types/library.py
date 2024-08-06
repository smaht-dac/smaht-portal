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

def validate_rna_specific_assay(context,request):
    """Check that analyte.molecule includes RNA for RNA-specific assays.
    
    The assays with `valid_moleucles` property may need to be updated as new techologies come out 
    or are added to the portal.
    """

    data = request.json
    if 'analytes' in data:
        molecules = []
        for analyte in data['analytes']:
            molecules+=get_item_or_none(request, analyte, 'analytes').get("molecule",[])
        assay = get_item_or_none(request,data['assay'],'assays')
        valid_molecules = assay.get("valid_molecules",[])
        if valid_molecules:
            if 'RNA' in molecules and 'RNA' not in valid_molecules:
                msg = f"Assay {assay} is specific to DNA analytes."
                return request.errors.add('body', 'Library: invalid links', msg)
            elif 'RNA' not in molecules and 'RNA' not in valid_molecules:
                msg = f"Assay {assay} is specific to RNA analytes."
                return request.errors.add('body', 'Library: invalid links', msg)
        return request.validated.update({})
    

def validate_assay_specific_properties(context,request):
    """Check that assay is appropriate for assay-specific properties.
    
    Assay-specific properties are in `ASSAY_DEPENDENT`
    """
    data = request.json
    if 'assay' in data:
        for property in ASSAY_DEPENDENT.keys():
            if data.get(property,""):
                assay = get_item_or_none(request,data['assay'],'assays').get("identifier","")
                if assay not in ASSAY_DEPENDENT[property]:
                    msg = f"Property {property} not compatible with assay {assay}."
                    return request.errors.add('body', 'Library: invalid property value', msg)
        return request.validated.update({})


LIBRARY_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_rna_specific_assay,
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
    validate_rna_specific_assay,
    validate_assay_specific_properties
]

LIBRARY_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_rna_specific_assay,
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