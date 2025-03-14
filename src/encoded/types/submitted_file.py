from pyramid.request import Request
from pyramid.view import view_config
from snovault import abstract_collection, calculated_property, load_schema
from snovault.util import debug_log

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


SUBMITTED_FILE_ADD_VALIDATORS = list(
    set(SUBMITTED_ITEM_ADD_VALIDATORS + FILE_ADD_VALIDATORS)
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
    set(SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + FILE_EDIT_PATCH_VALIDATORS)
)
SUBMITTED_FILE_EDIT_PUT_VALIDATORS = list(
    set(SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + FILE_EDIT_PUT_VALIDATORS)
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
