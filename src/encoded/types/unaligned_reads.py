from snovault import collection, load_schema
from snovault.util import debug_log, get_item_or_none
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


def validate_read_pairs(context,request):
    """Check that file is R2 if it has `paired_with` and link of R2 files corresponds to an R1 file."""
    data = request.json
    if 'read_pair_number' in data and 'paired_with' in data:
        paired_reads = get_item_or_none(request,data['paired_with'],'unaligned-reads').get("read_pair_number","")
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

    

UNALIGNED_READS_ADD_VALIDATORS = SUBMITTED_FILE_ADD_VALIDATORS + [
    validate_read_pairs
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
    validate_read_pairs
]

UNALIGNED_READS_EDIT_PUT_VALIDATORS = SUBMITTED_FILE_EDIT_PUT_VALIDATORS + [
    validate_read_pairs
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