from typing import Union, List
from pyramid.request import Request
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
     file as file_utils,
     file_set as file_set_utils,
     sequencer as sequencer_utils,
     sequencing as sequencing_utils,
)

SEQUENCER_DEPENDENT = {
    "ONT": ["gpu_architecture", "model", "modification_tags"]
}

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
    read_pair_number = data['read_pair_number'] if 'read_pair_number' in data else None
    paired_with = data['paired_with'] if 'paired_with' in data else None
    return check_read_pairs_paired_with(request, data['submitted_id'], paired_with, read_pair_number)


@link_related_validator
def validate_read_pairs_on_edit(context,request):
    """Check that file is R2 if it has `paired_with` and link of R2 files corresponds to an R1 file on edit."""
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    paired_with = get_property_for_validation('paired_with', existing_properties, properties_to_update)
    read_pair_number = get_property_for_validation('read_pair_number', existing_properties, properties_to_update)
    return check_read_pairs_paired_with(request, existing_properties['submitted_id'], paired_with, read_pair_number)


def check_read_pairs_paired_with(request, submitted_id: str, paired_with: Union[str,None], read_pair_number: Union[str,None]):
    """Check that file is R2 if it has `paired_with` and link of R2 files corresponds to an R1 file"""
    if read_pair_number and paired_with:
        if (read := get_item_or_none(request, paired_with, 'unaligned-reads')):
            paired_reads = ur_utils.get_read_pair_number(read)
            if read_pair_number != 'R2': # paired_with is exclusive to R2
                msg = f"paired_with property is specific to R2 files, read_pair_number is {read_pair_number}."
                return request.errors.add('body', 'UnalignedReads: invalid property', msg)
            elif paired_reads != "R1":
                msg = f"paired_with file must have read_pair_number of R1, Linked file read_pair_number is {paired_reads}."
                return request.errors.add('body', 'UnalignedReads: invalid links', msg)
            else:
                return request.validated.update({})
        else:
            msg = f"No file found for `paired_with` file {paired_with} for file {submitted_id}. Make sure R1 files are before paired R2 files in submission spreadsheet."
            return request.errors.add('body', 'UnalignedReads: invalid submission order', msg)
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


@link_related_validator
def validate_read_pairs_in_file_sets_on_add(context, request):
    """Check that the R1 and R2 files are linked to the same FileSet on add."""
    data = request.json
    paired_with = data['paired_with'] if 'paired_with' in data else None
    file_sets = data['file_sets']
    return check_read_pairs_in_file_sets(request, data['submitted_id'], paired_with, file_sets)


@link_related_validator
def validate_read_pairs_in_file_sets_on_edit(context, request):
    """Check that the R1 and R2 files are linked to the same FileSet on edit."""
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    paired_with = get_property_for_validation('paired_with', existing_properties, properties_to_update)
    file_sets = get_property_for_validation('file_sets', existing_properties, properties_to_update)
    return check_read_pairs_in_file_sets(request, existing_properties['submitted_id'], paired_with, file_sets)


def check_read_pairs_in_file_sets(request, submitted_id: str, paired_with: Union[str, None], file_sets: List[str]):
    """Check that the R1 and R2 files are linked to the same FileSet"""
    if paired_with:
        if (read := get_item_or_none(request, paired_with, 'unaligned-reads')):
            r1_file_sets = ur_utils.get_file_sets_display_titles(request, file_utils.get_file_sets(read))
            r2_file_sets = ur_utils.get_file_sets_display_titles(request, file_sets)
            if not list(set(r1_file_sets) & set(r2_file_sets)):
                msg = f"{submitted_id} paired_with file must be linked to the same FileSet. R2 file linked to file set {r2_file_sets} and R1 file linked to file set {r1_file_sets}."
                return request.errors.add('body', 'UnalignedReads: invalid links', msg)
            else:
                return request.validated.update({})
        else:
            msg = f"No file found for `paired_with` file {paired_with} for file {submitted_id}. Make sure R1 files are before paired R2 files in submission spreadsheet."
            return request.errors.add('body', 'UnalignedReads: invalid submission order', msg)
    return request.validated.update({})

@link_related_validator
def validate_basecalling_software_for_ont_on_add(context, request):
    """Validate software and sequencer.platform if ONT on add"""
    if 'force_pass' in request.query_string:
        return
    data = request.json
    software = data['software'] if 'software' in data else None
    file_sets = data['file_sets'] if 'file_sets' in data else None
    return check_basecalling_software_for_ont(request, data['submitted_id'], software, file_sets)


@link_related_validator
def validate_basecalling_software_for_ont_on_edit(context, request):
    """Validate software and sequencer.platform if ONT on edit."""
    if 'force_pass' in request.query_string:
        return
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    software = get_property_for_validation('software', existing_properties, properties_to_update)
    file_sets = get_property_for_validation('file_sets', existing_properties, properties_to_update)
    return check_basecalling_software_for_ont(request, existing_properties['submitted_id'], software, file_sets)


def check_basecalling_software_for_ont(
    request: Request,
    submitted_id: str,
    software: Union[List[str], None],
    file_sets: Union[List[str], None]
):
    """Check if the basecalling-specific properties for software are present if the sequencer.platform is ONT.
    
    Sequencer-specific properties are in `SEQUENCER_DEPENDENT`
    """
    if file_sets:
        sequencings = [file_set_utils.get_sequencing(get_item_or_none(request, file_set, 'file_set')) for file_set in file_sets]
        sequencer_aids = [sequencing_utils.get_sequencer(
            get_item_or_none(request, sequencing, 'sequencing')
        ) for sequencing in sequencings]
        platforms = [sequencer_utils.get_platform(
            get_item_or_none(request, sequencer_aid, 'sequencer')
        ) for sequencer_aid in sequencer_aids]
        for key, value in SEQUENCER_DEPENDENT.items():
            if key in platforms:
                # if not software:
                #     msg = f"No software found for file {submitted_id}. Software items are required for {key} files."
                #     return request.errors.add('body', 'SubmittedFile: invalid links', msg)
                # else:
                if software:
                    sequencer_properties_present = False
                    for sw in software:
                        software_item = get_item_or_none(request, sw ,'software')
                        if all(item in software_item.keys() for item in value):
                            sequencer_properties_present = True
                    if sequencer_properties_present:
                        return request.validated.update({})
                    else:
                        msg = f"Sequencer-specific Software properties not found for file {submitted_id}. The following Software properties are required for {key} files: {value}."
                        return request.errors.add('body', 'Software: invalid properties', msg)
            return request.validated.update({})


UNALIGNED_READS_ADD_VALIDATORS = SUBMITTED_FILE_ADD_VALIDATORS + [
    # validate_read_pairs_on_add,
    # validate_read_pairs_in_file_sets_on_add,
    # validate_basecalling_software_for_ont_on_add,

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
    # validate_read_pairs_on_edit,
    # validate_read_pairs_in_file_sets_on_edit,
    # validate_basecalling_software_for_ont_on_edit,
]

UNALIGNED_READS_EDIT_PUT_VALIDATORS = SUBMITTED_FILE_EDIT_PUT_VALIDATORS + [
    # validate_read_pairs_on_edit,
    # validate_read_pairs_in_file_sets_on_edit,
    # validate_basecalling_software_for_ont_on_edit,
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
