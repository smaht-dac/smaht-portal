from snovault import collection, load_schema
from snovault.util import debug_log
from pyramid.view import view_config
from copy import deepcopy

from .base import collection_add, item_edit
from .protected_metadata import validate_donor_is_protected_donor
from .submitted_item import (
    SubmittedItem,
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
)
from .acl import ONLY_DBGAP_VIEW_ACL, ONLY_PUBLIC_DBGAP_VIEW_ACL


@collection(
    name="demographics",
    unique_key="submitted_id",
    properties={
        "title": "Demographics",
        "description": "Details of donors' demographics",
    },
)
class Demographic(SubmittedItem):
    item_type = "demographic"
    schema = load_schema("encoded:schemas/demographic.json")
    embedded_list = []

    class Collection(SubmittedItem.Collection):
        pass

    SUBMISSION_CENTER_STATUS_ACL = deepcopy(SubmittedItem.SUBMISSION_CENTER_STATUS_ACL)
    SUBMISSION_CENTER_STATUS_ACL.update({
        'protected-early': ONLY_DBGAP_VIEW_ACL,
        'protected-network': ONLY_DBGAP_VIEW_ACL,
        'protected': ONLY_PUBLIC_DBGAP_VIEW_ACL
    })
    CONSORTIUM_STATUS_ACL = deepcopy(SubmittedItem.CONSORTIUM_STATUS_ACL)
    CONSORTIUM_STATUS_ACL.update({
        'protected-early': ONLY_DBGAP_VIEW_ACL,
        'protected-network': ONLY_DBGAP_VIEW_ACL,
        'protected': ONLY_PUBLIC_DBGAP_VIEW_ACL
    })


validate_demographic_donor_is_protected_donor = validate_donor_is_protected_donor(
    "Demographic"
)

DEMOGRAPHIC_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_demographic_donor_is_protected_donor,
]

DEMOGRAPHIC_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_demographic_donor_is_protected_donor,
]

DEMOGRAPHIC_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_demographic_donor_is_protected_donor,
]


@view_config(
    context=Demographic.Collection,
    permission="add",
    request_method="POST",
    validators=DEMOGRAPHIC_ADD_VALIDATORS,
)
@debug_log
def demographic_add(context, request, render=None):
    return collection_add(context, request, render)


@view_config(
    context=Demographic,
    permission="edit",
    request_method="PUT",
    validators=DEMOGRAPHIC_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=Demographic,
    permission="edit",
    request_method="PATCH",
    validators=DEMOGRAPHIC_EDIT_PATCH_VALIDATORS,
)
@debug_log
def demographic_edit(context, request, render=None):
    return item_edit(context, request, render)


