from pyramid.view import view_config
from pyramid.security import (
    Allow, Deny, Everyone, Authenticated
)
from snovault import abstract_collection, calculated_property
from snovault.types.base import (
    Item,
    Collection,
    DELETED_ACL,
    Acl
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


# ACLs for SMaHT Portal
# Names should be self-explanatory
CONSORTIUM_MEMBER = 'role.consortium_member'
SUBMISSION_CENTER_MEMBER = 'role.submission_center_member'

#
# # These two ACLs allow
# SUBMISSION_CENTER_MEMBER_CREATE_ACL: Acl = [
#     (Allow, SUBMISSION_CENTER_MEMBER, 'add'),
#     (Allow, SUBMISSION_CENTER_MEMBER, 'create')
# ]
# CONSORTIUM_MEMBER_CREATE_ACL: Acl = [
#     (Allow, CONSORTIUM_MEMBER, 'add'),
#     (Allow, CONSORTIUM_MEMBER, 'create')
# ]


ONLY_ADMIN_VIEW_ACL: Acl = [
    (Allow, 'group.admin', ['view', 'edit']),
    (Allow, 'group.read-only-admin', ['view']),
    (Allow, 'remoteuser.INDEXER', ['view']),
    (Allow, 'remoteuser.EMBED', ['view']),
    (Deny, Everyone, ['view', 'edit'])
]


ALLOW_EVERYONE_VIEW_ACL: Acl = [
    (Allow, Everyone, ['view']),
] + ONLY_ADMIN_VIEW_ACL


ALLOW_AUTHENTICATED_VIEW_ACL: Acl = [
    (Allow, Authenticated, ['view']),
] + ONLY_ADMIN_VIEW_ACL


ALLOW_OWNER_EDIT_ACL: Acl = [
    (Allow, 'role.owner', ['edit', 'view', 'view_details']),
]


ALLOW_CONSORTIUM_MEMBER_VIEW_ACL: Acl = [
    (Allow, CONSORTIUM_MEMBER, ['view'])
] + ONLY_ADMIN_VIEW_ACL


ALLOW_CONSORTIUM_MEMBER_EDIT_ACL: Acl = [
    (Allow, CONSORTIUM_MEMBER, ['view', 'edit'])
] + ONLY_ADMIN_VIEW_ACL


ALLOW_SUBMISSION_CENTER_MEMBER_VIEW_ACL: Acl = [
    (Allow, SUBMISSION_CENTER_MEMBER, ['view'])
] + ONLY_ADMIN_VIEW_ACL


ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL: Acl = [
    (Allow, SUBMISSION_CENTER_MEMBER, ['view', 'edit'])
] + ONLY_ADMIN_VIEW_ACL


ALLOW_CONSORTIUM_AND_SUBMISSION_CENTER_MEMBER_VIEW_ACL: Acl = [
    (Allow, SUBMISSION_CENTER_MEMBER, ['view']),
    (Allow, CONSORTIUM_MEMBER, ['view']),
] + ONLY_ADMIN_VIEW_ACL


ALLOW_CONSORTIUM_AND_SUBMISSION_CENTER_MEMBER_EDIT_ACL: Acl = [
    (Allow, SUBMISSION_CENTER_MEMBER, ['view', 'edit']),
    (Allow, SUBMISSION_CENTER_MEMBER, ['view', 'edit']),
] + ONLY_ADMIN_VIEW_ACL


def mixin_smaht_permission_types(schema: dict) -> dict:
    """ Runs a manual 'mixin' of attribution entries for SMaHT types """
    schema['properties']['submission_centers'] = {
        'type': 'array',
        'items': {
            'linkTo': 'SubmissionCenter'
        }
    }
    schema['properties']['consortiums'] = {
        'type': 'array',
        'items': {
            'linkTo': 'Consortiums'
        }
    }
    return schema


class SMAHTCollection(Collection):
    """ Allows default ACL """
    def __init__(self, *args, **kw):
        """smth."""
        super(Collection, self).__init__(*args, **kw)
        if hasattr(self, '__acl__'):
            return

        # If no ACLs are defined for collection, allow project members to create
        if 'submission_centers' in self.type_info.factory.schema['properties']:
            self.__acl__ = ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL


@abstract_collection(
    name='smaht-items',
    properties={
        'title': "SMaHT Item Listing",
        'description': 'Abstract collection of all SMaHT Items.',
    }
)
class SMAHTItem(Item):
    # This value determines the default status mapping of permissions
    # Ie: if an item status = public, then the ACL ALLOW_EVERYONE_VIEW applies to its permissions,
    # so anyone (even unauthenticated users) can view it
    STATUS_ACL = {
        'shared': ALLOW_CONSORTIUM_AND_SUBMISSION_CENTER_MEMBER_VIEW_ACL,
        'obsolete': ALLOW_CONSORTIUM_AND_SUBMISSION_CENTER_MEMBER_VIEW_ACL,
        'current': ALLOW_CONSORTIUM_AND_SUBMISSION_CENTER_MEMBER_VIEW_ACL,
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

    def __acl__(self):
        """This sets the ACL for the item based on mapping of status to ACL.
           If there is no status or the status is not included in the STATUS_ACL
           lookup then the access is set to admin only
        """
        # Don't finalize to avoid validation here.
        properties = self.upgrade_properties().copy()
        status = properties.get('status')
        return self.STATUS_ACL.get(status, ONLY_ADMIN_VIEW_ACL)

    def __ac_local_roles__(self):
        """ Overrides the default permissioning to add some additional roles to the item based on
            properties it may have.
        """
        roles = {}
        properties = self.upgrade_properties()
        if 'submission_centers' in properties:
            for submission_center in properties['submission_centers']:
                center = f'role.submission_center_member.{submission_center}'
                roles[center] = SUBMISSION_CENTER_MEMBER
        if 'consortiums' in properties:
            for consortium in properties['consortiums']:
                consortium_identifier = f'consortium.{consortium}'
                roles[consortium_identifier] = CONSORTIUM_MEMBER
        if 'submitted_by' in properties:
            submitter = 'userid.%s' % properties['submitted_by']
            roles[submitter] = 'role.owner'
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
    context=Collection,
    permission='add',
    request_method='POST',
    # validators=[]  # TURNS OFF VALIDATION HERE ([validate_item_content_post] previously)
    validators=[validate_item_content_post]
)
@view_config(
    context=Collection,
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
