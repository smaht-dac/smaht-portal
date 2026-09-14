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
    name="death-circumstances",
    unique_key="submitted_id",
    properties={
        "title": "Death Circumstances",
        "description": "Details of a donor's death",
    },
)
class DeathCircumstances(SubmittedItem):
    item_type = "death_circumstances"
    schema = load_schema("encoded:schemas/death_circumstances.json")
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


validate_death_circumstances_donor_is_protected_donor = validate_donor_is_protected_donor(
    "DeathCircumstances"
)

DEATH_CIRCUMSTANCES_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_death_circumstances_donor_is_protected_donor,
]

DEATH_CIRCUMSTANCES_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_death_circumstances_donor_is_protected_donor,
]

DEATH_CIRCUMSTANCES_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_death_circumstances_donor_is_protected_donor,
]


@view_config(
    context=DeathCircumstances.Collection,
    permission="add",
    request_method="POST",
    validators=DEATH_CIRCUMSTANCES_ADD_VALIDATORS,
)
@debug_log
def death_circumstances_add(context, request, render=None):
    return collection_add(context, request, render)


@view_config(
    context=DeathCircumstances,
    permission="edit",
    request_method="PUT",
    validators=DEATH_CIRCUMSTANCES_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=DeathCircumstances,
    permission="edit",
    request_method="PATCH",
    validators=DEATH_CIRCUMSTANCES_EDIT_PATCH_VALIDATORS,
)
@debug_log
def death_circumstances_edit(context, request, render=None):
    return item_edit(context, request, render)
