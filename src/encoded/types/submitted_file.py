from typing import Any, Dict, List, Optional, Union
from pyramid.request import Request
from pyramid.view import view_config
from snovault import abstract_collection, calculated_property, load_schema
from snovault.util import debug_log, get_item_or_none

from encoded.validator_decorators import link_related_validator

from .acl import SUBMISSION_CENTER_MEMBER_CREATE_ACL
from .base import collection_add, Item, item_edit
from .file import (
    FILE_ADD_UNVALIDATED_VALIDATORS,
    FILE_ADD_VALIDATORS,
    FILE_INDEX_GET_VALIDATORS,
    FILE_EDIT_PATCH_VALIDATORS,
    FILE_EDIT_PUT_VALIDATORS,
    FILE_EDIT_UNVALIDATED_PATCH_VALIDATORS,
    FILE_EDIT_UNVALIDATED_PUT_VALIDATORS,
    File,
)
from .submitted_item import (
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
    SubmittedItem,
)
from .utils import get_properties, get_property_for_validation
from ..item_utils import (
    item as item_utils,
    file as file_utils,
    file_set as file_set_utils,
    sequencer as sequencer_utils,
    sequencing as sequencing_utils,
    software as sofware_utils,
)

SEQUENCER_DEPENDENT = {
    "ONT": ["gpu", "model", "modification_tags"]
}

def show_upload_credentials(request=None, context=None, status=None):
    if request is None or status not in ('uploading', 'to be uploaded by workflow', 'upload failed'):
        return False
    return request.has_permission('edit', context)


class SubmittedFileCollection(Item.Collection):
    pass


@abstract_collection(
    name="submitted-files",
    unique_key="submitted_id",
    acl=SUBMISSION_CENTER_MEMBER_CREATE_ACL,
    properties={
        "title": "SMaHT Submitted Files",
        "description": "Listing of SMaHT Submitted Files",
    })
class SubmittedFile(File, SubmittedItem):
    item_type = "submitted_file"
    base_types = ["SubmittedFile"] + File.base_types
    schema = load_schema("encoded:schemas/submitted_file.json")
    embedded_list = File.embedded_list

    Collection = SubmittedFileCollection

    @calculated_property(condition=show_upload_credentials, schema={
        "type": "object",
    })
    def upload_credentials(self):
        external = self.propsheets.get('external', None)
        if external is not None:
            return external['upload_credentials']

    @calculated_property(condition=show_upload_credentials, schema={
        "type": "object",
    })
    def extra_files_creds(self):
        external = self.propsheets.get('external', None)
        if external is not None:
            extras = []
            for extra in self.properties.get('extra_files', []):
                eformat = extra.get('file_format')
                xfile_format = self.registry['collections']['FileFormat'].get(eformat)
                try:
                    xff_uuid = str(xfile_format.uuid)
                except AttributeError:
                    print("Can't find required format uuid for %s" % eformat)
                    continue
                extra_creds = self.propsheets.get('external' + xff_uuid)
                extra['upload_credentials'] = extra_creds['upload_credentials']
                extras.append(extra)
            return extras


@link_related_validator
def validate_basecalling_software_for_ont_on_add(context, request):
    """Validate software and sequencer.platform if ONT on add"""
    data = request.json
    software = data['software'] if 'software' in data else None
    file_sets = data['file_sets'] if 'file_sets' in data else None
    return check_basecalling_software_for_ont(request, data['submitted_id'], software, file_sets)


@link_related_validator
def validate_basecalling_software_for_ont_on_edit(context, request):
    """Validate software and sequencer.platform if ONT on edit."""
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


SUBMITTED_FILE_ADD_VALIDATORS = list(
    set(SUBMITTED_ITEM_ADD_VALIDATORS + FILE_ADD_VALIDATORS + [
        validate_basecalling_software_for_ont_on_add,
    ])
)

@view_config(
    context=SubmittedFile.Collection,
    permission="add",
    request_method="POST",
    validators=SUBMITTED_FILE_ADD_VALIDATORS,
)
@view_config(
    context=SubmittedFile.Collection,
    permission="add_unvalidated",
    request_method="POST",
    validators=FILE_ADD_UNVALIDATED_VALIDATORS,
    request_param=["validate=false"],
)
@debug_log
def submitted_file_add(context: Item, request: Request, render=None):
    return collection_add(context, request, render)

SUBMITTED_FILE_EDIT_PATCH_VALIDATORS = list(
    set(SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + FILE_EDIT_PATCH_VALIDATORS + [
        validate_basecalling_software_for_ont_on_edit,
    ])
)
SUBMITTED_FILE_EDIT_PUT_VALIDATORS = list(
    set(SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + FILE_EDIT_PUT_VALIDATORS+ [
        validate_basecalling_software_for_ont_on_edit,
    ])
)

@view_config(
    context=SubmittedFile,
    permission="edit",
    request_method="PUT",
    validators=SUBMITTED_FILE_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=SubmittedFile,
    permission="edit",
    request_method="PATCH",
    validators=SUBMITTED_FILE_EDIT_PATCH_VALIDATORS,
)
@view_config(
    context=SubmittedFile,
    permission="edit_unvalidated",
    request_method="PUT",
    validators=FILE_EDIT_UNVALIDATED_PUT_VALIDATORS,
    request_param=["validate=false"],
)
@view_config(
    context=SubmittedFile,
    permission="edit_unvalidated",
    request_method="PATCH",
    validators=FILE_EDIT_UNVALIDATED_PATCH_VALIDATORS,
    request_param=["validate=false"],
)
@view_config(
    context=SubmittedFile,
    permission="index",
    request_method="GET",
    validators=FILE_INDEX_GET_VALIDATORS,
    request_param=["check_only=true"],
)
@debug_log
def submitted_file_edit(context: Item, request: Request, render=None):
    return item_edit(context, request, render)
