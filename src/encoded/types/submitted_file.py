from pyramid.request import Request
from pyramid.view import view_config
from snovault import abstract_collection, load_schema
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


SUBMITTED_FILE_ADD_VALIDATORS = list(
    set(SUBMITTED_ITEM_ADD_VALIDATORS + FILE_ADD_VALIDATORS)
)
SUBMITTED_FILE_EDIT_PATCH_VALIDATORS = list(
    set(SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + FILE_EDIT_PATCH_VALIDATORS)
)
SUBMITTED_FILE_EDIT_PUT_VALIDATORS = list(
    set(SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + FILE_EDIT_PUT_VALIDATORS)
)


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
