from typing import Any, Dict, List, Optional, Union

from dcicutils.misc_utils import PRINT
from pyramid.request import Request
from pyramid.view import view_config
from snovault import AbstractCollection, abstract_collection, calculated_property
from snovault.crud_views import (
    collection_add as sno_collection_add,
    item_edit as sno_item_edit,
)
from snovault.validation import ValidationFailure
from snovault.types.base import (
    Collection,
    DELETED_ACL,
    Item as SnovaultItem,
)
from snovault.util import debug_log
from snovault.validators import (
    validate_item_content_post,
    validate_item_content_put,
    validate_item_content_patch,
    validate_item_content_in_place,
    no_validate_item_content_post,
    no_validate_item_content_put,
    no_validate_item_content_patch
)

from .acl import *
from .utils import get_item_properties_via_request
from ..local_roles import DEBUG_PERMISSIONS


def mixin_smaht_permission_types(schema: dict) -> dict:
    """ Runs a manual 'mixin' of attribution entries for SMaHT types
        NOTE: this function will be replaced by dynamic dispatch later
    """
    schema['properties']['submission_centers'] = {
        'type': 'array',
        'items': {
            'type': 'string',
            'linkTo': 'SubmissionCenter'
        },
        'serverDefault': 'user_submission_centers'
    }
    schema['properties']['consortia'] = {
        'type': 'array',
        'items': {
            'type': 'string',
            'linkTo': 'Consortium'
        },
        'serverDefault': 'user_consortia'
    }
    return schema


class AbstractCollection(AbstractCollection):
    """smth."""

    def __init__(self, *args, **kw):
        try:
            self.lookup_key = kw.pop('lookup_key')
        except KeyError:
            pass
        super(AbstractCollection, self).__init__(*args, **kw)

    def get(self, name, default=None):
        """
        heres' and example of why this is the way it is:
        ontology terms have uuid or term_id as unique ID keys
        and if neither of those are included in post, try to
        use term_name such that:
        No - fail load with non-existing term message
        Multiple - fail load with ‘ambiguous name - more than 1 term with that name exist use ID’
        Single result - get uuid and use that for post/patch
        """
        resource = super(AbstractCollection, self).get(name, None)
        if resource is not None:
            return resource
        if ':' in name:
            resource = self.connection.get_by_unique_key('alias', name)
            if resource is not None:
                if not self._allow_contained(resource):
                    return default
                return resource
        if getattr(self, 'lookup_key', None) is not None:
            # lookup key translates to query json by key / value and return if only one of the
            # item type was found... so for keys that are mostly unique, but do to whatever
            # reason (bad data mainly..) can be defined as unique keys
            item_type = self.type_info.item_type
            resource = self.connection.get_by_json(self.lookup_key, name, item_type)
            if resource is not None:
                if not self._allow_contained(resource):
                    return default
                return resource
        return default


class SMAHTCollection(Collection, AbstractCollection):
    """ Allows default ACL """
    def __init__(self, *args, **kw):
        super(Collection, self).__init__(*args, **kw)
        if hasattr(self, '__acl__'):
            if DEBUG_PERMISSIONS:
                PRINT(f'DEBUG_PERMISSIONS: using {self.__acl__} for {self.type_info.name}')
            return

        # If no ACLs are defined for collection, allow submission centers to add/create
        if 'submission_centers' in self.type_info.factory.schema['properties']:
            if DEBUG_PERMISSIONS:
                PRINT(f'DEBUG_PERMISSIONS: using {ALLOW_SUBMISSION_CENTER_CREATE_ACL} for {self.type_info.name}')
            self.__acl__ = ALLOW_SUBMISSION_CENTER_CREATE_ACL
        else:
            self.__acl__ = ONLY_ADMIN_VIEW_ACL
            if DEBUG_PERMISSIONS:
                PRINT(f'DEBUG_PERMISSIONS: using admin acl for {self.type_info.name}')


@abstract_collection(
    name='items',
    properties={
        'title': "SMaHT Item Listing",
        'description': 'Abstract collection of all SMaHT Items.',
    }
)
class Item(SnovaultItem):
    """ Note: originally denoted SMAHTItem, this rename breaks many things downstream in our type resolution
        system, and generally varying the name in the class from the type definition name below (item_type) does
        not work as you would intend - there is not really any reason to allow this setting and should just default
        to the snake case version of self.__name__
    """
    item_type = 'item'
    AbstractCollection = AbstractCollection
    Collection = SMAHTCollection
    # This value determines the default status mapping of permissions
    # Ie: if an item status = public, then the ACL ALLOW_EVERYONE_VIEW applies to its permissions,
    # so anyone (even unauthenticated users) can view it
    SUBMISSION_CENTER_STATUS_ACL = {
        'shared': ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'obsolete': ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'current': ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'inactive': ALLOW_SUBMISSION_CENTER_MEMBER_VIEW_ACL,
        'in review': ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'uploaded': ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'uploading': ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'archived': ALLOW_SUBMISSION_CENTER_MEMBER_VIEW_ACL,
        'deleted': DELETED_ACL,
        'replaced': ONLY_ADMIN_VIEW_ACL,
        # Everyone can view - restricted to specific items via schemas.
        'public': ALLOW_EVERYONE_VIEW_ACL,
        # Only creator can view - restricted to specific items via schemas.
        'draft': ALLOW_OWNER_EDIT_ACL
    }
    # For now, replicate the same
    CONSORTIUM_STATUS_ACL = SUBMISSION_CENTER_STATUS_ACL

    def __init__(self, registry, models):
        super().__init__(registry, models)
        self.STATUS_ACL = self.__class__.STATUS_ACL

    def __acl__(self):
        """This sets the ACL for the item based on mapping of status to ACL.
           If there is no status or the status is not included in the STATUS_ACL
           lookup then the access is set to admin only

           Note that by default, items cannot be created, they must be specifically overridden
           in the type definition
        """
        # Don't finalize to avoid validation here.
        properties = self.upgrade_properties().copy()
        status = properties.get('status')
        if 'consortia' in properties:
            if DEBUG_PERMISSIONS:
                PRINT(f'DEBUG_PERMISSIONS: Using consortia ACLs status {status} for {self}')
            return self.CONSORTIUM_STATUS_ACL.get(status, ONLY_ADMIN_VIEW_ACL)
        if 'submission_centers' in properties:
            if DEBUG_PERMISSIONS:
                PRINT(f'DEBUG_PERMISSIONS: Using submission_centers ACLs status {status} for {self}')
            return self.SUBMISSION_CENTER_STATUS_ACL.get(status, ONLY_ADMIN_VIEW_ACL)
        if DEBUG_PERMISSIONS:
            PRINT(f'DEBUG_PERMISSIONS: Falling back to admin view for {self}')
        return ONLY_ADMIN_VIEW_ACL

    def __ac_local_roles__(self):
        """ Overrides the default permissioning to add some additional roles to the item based on
            properties it may have.
        """
        roles = {}
        properties = self.upgrade_properties()
        if 'submission_centers' in properties:
            for submission_center in properties['submission_centers']:
                center = f'{SUBMISSION_CENTER_RW}.{submission_center}'
                roles[center] = SUBMISSION_CENTER_RW
        if 'consortia' in properties:
            for consortium in properties['consortia']:
                consortium_identifier = f'{CONSORTIUM_MEMBER_RW}.{consortium}'
                roles[consortium_identifier] = CONSORTIUM_MEMBER_RW
        if 'submitted_by' in properties:
            submitter = 'userid.%s' % properties['submitted_by']
            roles[submitter] = 'role.owner'
        if DEBUG_PERMISSIONS:
            PRINT(f'DEBUG_PERMISSIONS: Returning roles {roles} for {self}')
        return roles

    def unique_keys(self, properties):
        """ VERY IMPORTANT: This function is required in all extensions of snovault, without it
            unique keys will NOT work!
        """
        keys = super(Item, self).unique_keys(properties)
        if 'accession' not in self.schema['properties']:
            return keys
        keys.setdefault('accession', []).extend(properties.get('alternate_accessions', []))
        if properties.get('status') != 'replaced' and 'accession' in properties:
            keys['accession'].append(properties['accession'])
        return keys


@calculated_property(context=Item.AbstractCollection, category='action')
def add(context, request):
    """smth."""
    if request.has_permission('add', context):
        type_name = context.type_info.name
        return {
            'name': 'add',
            'title': 'Add',
            'profile': '/profiles/{name}.json'.format(name=type_name),
            'href': '/search/?type={name}&currentAction=add'.format(name=type_name),
        }


@calculated_property(context=Item, category='action')
def edit(context, request):
    """smth."""
    if request.has_permission('edit'):
        return {
            'name': 'edit',
            'title': 'Edit',
            'profile': '/profiles/{ti.name}.json'.format(ti=context.type_info),
            'href': '{item_uri}?currentAction=edit'.format(item_uri=request.resource_path(context)),
        }


@calculated_property(context=Item, category='action')
def create(context, request):
    if request.has_permission('create'):
        return {
            'name': 'create',
            'title': 'Create',
            'profile': '/profiles/{ti.name}.json'.format(ti=context.type_info),
            'href': '{item_uri}?currentAction=create'.format(item_uri=request.resource_path(context)),
        }


@view_config(
    context=SMAHTCollection,
    permission='add',
    request_method='POST',
    # validators=[]  # TURNS OFF VALIDATION HERE ([validate_item_content_post] previously)
    validators=[validate_item_content_post]
)
@view_config(
    context=SMAHTCollection,
    permission='add_unvalidated',
    request_method='POST',
    validators=[no_validate_item_content_post],
    request_param=['validate=false']
)
@debug_log
def collection_add(context, request, render=None):
    return sno_collection_add(context, request, render)


@view_config(context=Item, permission='edit', request_method='PUT',
             validators=[validate_item_content_put])
@view_config(context=Item, permission='edit', request_method='PATCH',
             validators=[validate_item_content_patch])
@view_config(context=Item, permission='edit_unvalidated', request_method='PUT',
             validators=[no_validate_item_content_put],
             request_param=['validate=false'])
@view_config(context=Item, permission='edit_unvalidated', request_method='PATCH',
             validators=[no_validate_item_content_patch],
             request_param=['validate=false'])
@view_config(context=Item, permission='index', request_method='GET',
             validators=[validate_item_content_in_place],
             request_param=['check_only=true'])
@debug_log
def item_edit(context, request, render=None):
    return sno_item_edit(context, request, render)


class SubmittedSmahtCollection(SMAHTCollection):
    pass


@abstract_collection(
    name="submitted-items",
    properties={
        "title": "SMaHT Submitted Item Listing",
        "description": "Abstract collection of all submitted SMaHT items.",
    }
)
class SubmittedItem(Item):
    Collection = SubmittedSmahtCollection


def validate_submitted_id_on_add(
    context: SubmittedSmahtCollection,
    request: Request,
) -> None:
    properties = get_properties_from_request(request)
    submitted_id = get_submitted_id(properties)
    submission_centers = get_submission_centers(properties)
    validation_error = validate_submitted_id(request, submitted_id, submission_centers)
    if validation_error:
        raise validation_error


def get_submitted_id(properties: Dict[str, Any]) -> str:
    return properties.get("submitted_id", "")


def get_submission_centers(properties: Dict[str, Any]) -> List[str]:
    return properties.get("submission_centers", [])


def get_properties_from_request(request: Request) -> Dict[str, Any]:
    return request.json


def validate_submitted_id(
    request: Request, submitted_id: str, submission_centers: List[str]
) -> Union[ValidationFailure, None]:
    if not submitted_id or not submission_centers:
        return get_missing_data_validation_failure(submitted_id, submission_centers)
    return validate_submitted_id_submission_center_code(
        request, submitted_id, submission_centers
    )


def get_missing_data_validation_failure(
    submitted_id: str, submission_centers: List[str]
) -> ValidationFailure:
    return ValidationFailure("", "", "")


def validate_submitted_id_submission_center_code(
    request: Request, submitted_id: str, submission_centers: List[str]
) -> Union[ValidationFailure, None]:
    submitted_id_submission_center_code = get_submitted_id_submission_center_code(
        submitted_id
    )
    submission_center_codes = get_submission_center_codes(request, submission_centers)
    if submitted_id_submission_center_code not in submission_center_codes:
        return ValidationFailure("", "", "")
    return


def get_submitted_id_submission_center_code(submitted_id: str) -> str:
    split_submitted_id = submitted_id.split("_")
    if split_submitted_id:
        return split_submitted_id[0]
    return ""


def get_submission_center_codes(
    request: Request, submission_centers: List[str]
) -> List[str]:
    submission_center_properties = [
        get_submission_center(request, submission_center)
        for submission_center in submission_centers
    ]
    return [
        properties.get("submitter_code") for properties in submission_center_properties
    ]


def get_submission_center(request: Request, submission_center: str) -> Dict[str, Any]:
    return get_item_properties_via_request(
        request, submission_center, collection="SubmissionCenter"
    )


def validate_submitted_id_on_edit(
    context: SubmittedItem,
    request: Request,
) -> None:
    import pdb; pdb.set_trace()
    existing_properties = get_properties_from_context(context)
    properties_to_update = get_properties_from_request(request)
    if does_update_require_validation(properties_to_update):
        submitted_id = get_submitted_id_for_validation(
            existing_properties, properties_to_update
        )
        submission_centers = get_submission_centers_for_validation(
            properties_to_update, existing_properties
        )
        validation_error = validate_submitted_id(
            request, submitted_id, submission_centers
        )
        if validation_error:
            raise validation_error


def get_properties_from_context(context: SubmittedItem) -> Dict[str, Any]:
    return context.properties


@view_config(
    context=SubmittedSmahtCollection,
    permission="add",
    request_method="POST",
    validators=[validate_item_content_post, validate_submitted_id_on_add],
)
@debug_log
def submitted_collection_add(
    context: SubmittedSmahtCollection, request: Request, render: Optional[bool] = None
) -> Dict[str, Any]:
    return collection_add(context, request, render)


@view_config(
    context=SubmittedItem,
    permission="edit",
    request_method="PUT",
    validators=[validate_item_content_put, validate_submitted_id_on_edit],
)
@view_config(
    context=SubmittedItem,
    permission="edit",
    request_method="PATCH",
    validators=[validate_item_content_patch, validate_submitted_id_on_edit],
)
@debug_log
def submitted_item_edit(
    context: SubmittedItem, request: Request, render: Optional[bool] = None
) -> Dict[str, Any]:
    return item_edit(context, request, render)
