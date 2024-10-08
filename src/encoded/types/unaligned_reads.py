from snovault import collection, load_schema
from snovault.util import debug_log, get_item_or_none
from encoded.validator_decorators import link_related_validator
from pyramid.view import view_config



from .submitted_file import (
    SUBMITTED_FILE_ADD_VALIDATORS,
    SUBMITTED_FILE_EDIT_PATCH_VALIDATORS,
    SUBMITTED_FILE_EDIT_PUT_VALIDATORS,
    SubmittedFile,
)
from .base import (
    collection_add,
    item_edit,
    Item
)
from .utils import get_properties, get_property_for_validation
from ..item_utils import (
     unaligned_reads as ur_utils,
     file as file_utils
)

@collection(
    name="unaligned-reads",
    unique_key="submitted_id",
    properties={
        "title": "Unaligned Reads",
        "description": "Files containing unaligned sequencing reads",
    })
class UnalignedReads(SubmittedFile):
    item_type = "unaligned_reads"
    schema = load_schema("encoded:schemas/unaligned_reads.json")
    embedded_list = SubmittedFile.embedded_list

    class Collection(Item.Collection):
        pass


@link_related_validator
def validate_read_pairs_on_add(context,request):
    """Check that file is R2 if it has `paired_with` and link of R2 files corresponds to an R1 file on add."""
    data = request.json
    if 'read_pair_number' in data and 'paired_with' in data:
        read = get_item_or_none(request, data['paired_with'], 'unaligned-reads')
        paired_reads = ur_utils.get_read_pair_number(read)
        if data['read_pair_number'] != 'R2': # paired_with is exclusive to R2
            msg = f"paired_with property is specific to R2 files, read_pair_number is {data['read_pair_number']}."
            return request.errors.add('body', 'UnalignedReads: invalid property', msg)
        elif paired_reads != "R1":
            msg = f"paired_with file must have read_pair_number of R1, Linked file read_pair_number is {paired_reads}."
            return request.errors.add('body', 'UnalignedReads: invalid links', msg)
        else:
            return request.validated.update({})
    elif 'paired_with' in data:
            msg = "paired_with property is specific to R2 files, No read_pair_number is provided."
            return request.errors.add('body', 'UnalignedReads: invalid property', msg)
    elif 'read_pair_number' in data:
            if data['read_pair_number'] == "R2":
                msg = "paired_with property is required for R2 files, No value provided"
                return request.errors.add('body', 'UnalignedReads: invalid property', msg)
            else:
                return request.validated.update({})
    else:
        return request.validated.update({})


@link_related_validator
def validate_read_pairs_on_edit(context,request):
    """Check that file is R2 if it has `paired_with` and link of R2 files corresponds to an R1 file on edit."""
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    paired_with = get_property_for_validation('paired_with', existing_properties, properties_to_update)
    read_pair_number = get_property_for_validation('read_pair_number', existing_properties, properties_to_update)
    if read_pair_number and paired_with:
        read = get_item_or_none(request, paired_with, 'unaligned-reads')
        paired_reads = ur_utils.get_read_pair_number(read)
        if read_pair_number != 'R2': # paired_with is exclusive to R2
            msg = f"paired_with property is specific to R2 files, read_pair_number is {read_pair_number}."
            return request.errors.add('body', 'UnalignedReads: invalid property', msg)
        elif paired_reads != "R1":
            msg = f"paired_with file must have read_pair_number of R1, Linked file read_pair_number is {paired_reads}."
            return request.errors.add('body', 'UnalignedReads: invalid links', msg)
        else:
            return request.validated.update({})
    elif paired_with:
            msg = "paired_with property is specific to R2 files, No read_pair_number is provided."
            return request.errors.add('body', 'UnalignedReads: invalid property', msg)
    elif read_pair_number:
            if read_pair_number == "R2":
                msg = "paired_with property is required for R2 files, No value provided"
                return request.errors.add('body', 'UnalignedReads: invalid property', msg)
            else:
                return request.validated.update({})
    else:
        return request.validated.update({})


def validate_read_pairs_in_file_sets_on_add(context,request):
    """Check that the R1 and R2 files are linked to the same FileSet on add."""
    data = request.json
    if 'paired_with' in data:
        read = get_item_or_none(request, data['paired_with'], 'unaligned-reads')
        r1_file_sets = ur_utils.get_file_sets_display_titles(request, file_utils.get_file_sets(read))
        r2_file_sets = ur_utils.get_file_sets_display_titles(request, data['file_sets'])
        if not list(set(r1_file_sets) & set(r2_file_sets)):
            msg = f"{data['submitted_id']} paired_with file must be linked to the same FileSet. R2 file linked to file set {r2_file_sets} and R1 file linked to file set {r1_file_sets}."
            return request.errors.add('body', 'UnalignedReads: invalid links', msg)
        else:
            return request.validated.update({})


def validate_read_pairs_in_file_sets_on_edit(context,request):
    """Check that the R1 and R2 files are linked to the same FileSet on edit."""
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    paired_with = get_property_for_validation('paired_with', existing_properties, properties_to_update)
    file_sets = get_property_for_validation('file_sets', existing_properties, properties_to_update)
    if paired_with:
        read = get_item_or_none(request, paired_with, 'unaligned-reads')
        r1_file_sets = ur_utils.get_file_sets_display_titles(request, file_utils.get_file_sets(read))
        r2_file_sets = ur_utils.get_file_sets_display_titles(request, file_sets)
        if not list(set(r1_file_sets) & set(r2_file_sets)):
            msg = f"{existing_properties['submitted_id']} paired_with file must be linked to the same FileSet. R2 file linked to file set {r2_file_sets} and R1 file linked to file set {r1_file_sets}."
            return request.errors.add('body', 'UnalignedReads: invalid links', msg)
        else:
            return request.validated.update({})



UNALIGNED_READS_ADD_VALIDATORS = SUBMITTED_FILE_ADD_VALIDATORS + [
    validate_read_pairs_on_add,
    validate_read_pairs_in_file_sets_on_add
]

@view_config(
    context=UnalignedReads.Collection,
    permission='add',
    request_method='POST',
    validators=UNALIGNED_READS_ADD_VALIDATORS,
)
@debug_log
def unaligned_reads_add(context, request, render=None):
    return collection_add(context, request, render)


UNALIGNED_READS_EDIT_PATCH_VALIDATORS = SUBMITTED_FILE_EDIT_PATCH_VALIDATORS + [
    validate_read_pairs_on_edit,
    validate_read_pairs_in_file_sets_on_edit
]

UNALIGNED_READS_EDIT_PUT_VALIDATORS = SUBMITTED_FILE_EDIT_PUT_VALIDATORS + [
    validate_read_pairs_on_edit,
    validate_read_pairs_in_file_sets_on_edit
]

@view_config(
    context=UnalignedReads,
    permission='edit',
    request_method='PUT',
    validators=UNALIGNED_READS_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=UnalignedReads,
    permission='edit',
    request_method='PATCH',
    validators=UNALIGNED_READS_EDIT_PATCH_VALIDATORS,
)
@debug_log
def unaligned_reads_edit(context, request, render=None):
    return item_edit(context, request, render)
