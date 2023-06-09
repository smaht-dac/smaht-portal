from pyramid.view import view_config
from snovault import AbstractCollection, abstract_collection, calculated_property
from snovault.types.base import (
    Item,
    Collection,
    DELETED_ACL,
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
from snovault.crud_views import (
    collection_add as sno_collection_add,
    item_edit as sno_item_edit,
)
from dcicutils.misc_utils import PRINT
from .acl import *
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


class SMAHTCollection(Collection, AbstractCollection):
    """ Allows default ACL """
    def __init__(self, *args, **kw):
        super(Collection, self).__init__(*args, **kw)
        if hasattr(self, '__acl__'):
            PRINT(f'DEBUG_PERMISSIONS: returning {self.__acl__} for {self.type_info.name}')
            return

        # If no ACLs are defined for collection, allow submission centers to add/create
        if 'submission_centers' in self.type_info.factory.schema['properties']:
            PRINT(f'DEBUG_PERMISSIONS: returning {ALLOW_SUBMISSION_CENTER_CREATE_ACL} for {self.type_info.name}')
            self.__acl__ = ALLOW_SUBMISSION_CENTER_CREATE_ACL
        else:
            self.__acl__ = ONLY_ADMIN_VIEW_ACL
            PRINT(f'DEBUG_PERMISSIONS: using admin acl for {self.type_info.name}')


@abstract_collection(
    name='items',
    properties={
        'title': "SMaHT Item Listing",
        'description': 'Abstract collection of all SMaHT Items.',
    }
)
class SMAHTItem(Item):
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


@calculated_property(context=SMAHTItem.AbstractCollection, category='action')
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


@calculated_property(context=SMAHTItem, category='action')
def edit(context, request):
    """smth."""
    if request.has_permission('edit'):
        return {
            'name': 'edit',
            'title': 'Edit',
            'profile': '/profiles/{ti.name}.json'.format(ti=context.type_info),
            'href': '{item_uri}?currentAction=edit'.format(item_uri=request.resource_path(context)),
        }


@calculated_property(context=SMAHTItem, category='action')
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


@view_config(context=SMAHTItem, permission='edit', request_method='PUT',
             validators=[validate_item_content_put])
@view_config(context=SMAHTItem, permission='edit', request_method='PATCH',
             validators=[validate_item_content_patch])
@view_config(context=SMAHTItem, permission='edit_unvalidated', request_method='PUT',
             validators=[no_validate_item_content_put],
             request_param=['validate=false'])
@view_config(context=SMAHTItem, permission='edit_unvalidated', request_method='PATCH',
             validators=[no_validate_item_content_patch],
             request_param=['validate=false'])
@view_config(context=SMAHTItem, permission='index', request_method='GET',
             validators=[validate_item_content_in_place],
             request_param=['check_only=true'])
@debug_log
def item_edit(context, request, render=None):
    return sno_item_edit(context, request, render)
