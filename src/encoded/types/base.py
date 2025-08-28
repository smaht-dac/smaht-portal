from typing import Any, Dict, List, Optional, Tuple, Union

from dcicutils.misc_utils import PRINT
from pyramid.request import Request
from pyramid.view import view_config
from snovault import AbstractCollection, abstract_collection, calculated_property
from snovault.crud_views import (
    collection_add as sno_collection_add,
    item_edit as sno_item_edit,
)
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
from snovault.server_defaults import add_last_modified

from . import acl
from .utils import get_item
from ..local_roles import DEBUG_PERMISSIONS
from ..schema_formats import is_accession
from ..utils import get_remote_user


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
        self.__acl__: List[Tuple[str, str, List[str]]] = []
        try:
            self.lookup_key = kw.pop('lookup_key')
        except KeyError:
            pass
        super(AbstractCollection, self).__init__(*args, **kw)

    def get(self, name, default=None):
        """Override method to allow more lookup keys for items.

        Base method allows lookup by uuid and unique key, but other
        unique keys can also be used, such as accession or aliases.
        """
        resource = super(AbstractCollection, self).get(name, None)
        if resource is not None:
            return resource
        if is_accession(name):
            resource = self.connection.get_by_unique_key('accession', name)
            if resource is not None:
                if not self._allow_contained(resource):
                    return default
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
        if getattr(self, '__acl__', []):
            if DEBUG_PERMISSIONS:
                PRINT(f'DEBUG_PERMISSIONS: using {self.__acl__} for {self.type_info.name}')
            return

        # If no ACLs are defined for collection, allow submission centers to add/create
        # or assume admin only
        if 'submission_centers' in self.type_info.factory.schema['properties']:
            if DEBUG_PERMISSIONS:
                PRINT(f'DEBUG_PERMISSIONS: using {acl.ALLOW_SUBMISSION_CENTER_CREATE_ACL} for {self.type_info.name}')
            self.__acl__ = acl.ALLOW_SUBMISSION_CENTER_CREATE_ACL
        else:
            self.__acl__ = acl.ONLY_ADMIN_VIEW_ACL
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
        # Only creator can view - restricted to specific items via schemas.
        'draft': acl.ALLOW_OWNER_EDIT_ACL,
        # Generally the default
        'in review': acl.ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'released': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        # Everyone can view - restricted to specific items via schemas.
        'public': acl.ALLOW_EVERYONE_VIEW_ACL,
        # Intended to do additional computation to determine if download
        # is allowed if it's a downloadable file, otherwise same as "released", similar for public-
        # restricted except the group is different and view is "public"
        'restricted': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'public-restricted': acl.ALLOW_EVERYONE_VIEW_ACL,
        # Intended to tag out-of-date data
        'obsolete': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'deleted': DELETED_ACL,
    }
    # More or less the same EXCEPT for in-review status
    CONSORTIUM_STATUS_ACL = {
        'draft': acl.ALLOW_OWNER_EDIT_ACL,
        'in review': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'released': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'public': acl.ALLOW_EVERYONE_VIEW_ACL,
        # Intended to do additional computation to determine if download
        # is allowed if it's a downloadable file, otherwise same as "released", similar for public-
        # restricted except the group is different and view is "public"
        'restricted': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'public-restricted': acl.ALLOW_EVERYONE_VIEW_ACL,
        'obsolete': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'deleted': DELETED_ACL
    }
    MINIMAL_STATUS_VIEW = {
        'released': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'public': acl.ALLOW_EVERYONE_VIEW_ACL,
    }

    def __init__(self, registry, models):
        super().__init__(registry, models)
        self.STATUS_ACL = self.__class__.STATUS_ACL

    def _update(self, properties, sheets=None):
        add_last_modified(properties)
        super(Item, self)._update(properties, sheets)

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
        if 'submission_centers' in properties:
            if DEBUG_PERMISSIONS:
                PRINT(f'DEBUG_PERMISSIONS: Using submission_centers ACLs status {status} for {self}')
            return self.SUBMISSION_CENTER_STATUS_ACL.get(status, acl.ONLY_ADMIN_VIEW_ACL)
        if 'consortia' in properties:
            if DEBUG_PERMISSIONS:
                PRINT(f'DEBUG_PERMISSIONS: Using consortia ACLs status {status} for {self}')
            return self.CONSORTIUM_STATUS_ACL.get(status, acl.ONLY_ADMIN_VIEW_ACL)
        if DEBUG_PERMISSIONS:
            PRINT(f'DEBUG_PERMISSIONS: Falling back to minimal status view for {self}')
        return self.MINIMAL_STATUS_VIEW.get(status, acl.ONLY_ADMIN_VIEW_ACL)

    def __ac_local_roles__(self):
        """ Overrides the default permissioning to add some additional roles to the item based on
            properties it may have.
        """
        roles = {}
        properties = self.upgrade_properties()
        if 'submission_centers' in properties:
            for submission_center in properties['submission_centers']:
                # add standard rw role
                center = f'{acl.SUBMISSION_CENTER_RW}.{submission_center}'
                roles[center] = acl.SUBMISSION_CENTER_RW
                # add create role
                submitter = f'submits_for.{submission_center}'
                roles[submitter] = acl.SUBMISSION_CENTER_SUBMITTER
        if 'consortia' in properties:
            for consortium in properties['consortia']:
                consortium_identifier = f'{acl.CONSORTIUM_MEMBER_RW}.{consortium}'
                roles[consortium_identifier] = acl.CONSORTIUM_MEMBER_RW
        if 'submitted_by' in properties:
            submitter = 'userid.%s' % properties['submitted_by']
            roles[submitter] = 'role.owner'
        if self.type_info.name == 'Consortium':
            consortium_identifier = f'{acl.CONSORTIUM_MEMBER_RW}.{str(self.uuid)}'
            roles[consortium_identifier] = acl.CONSORTIUM_MEMBER_RW
        if self.type_info.name == 'SubmissionCenter':
            center = f'{acl.SUBMISSION_CENTER_RW}.{str(self.uuid)}'
            roles[center] = acl.SUBMISSION_CENTER_RW
        if DEBUG_PERMISSIONS:
            PRINT(f'DEBUG_PERMISSIONS: Returning roles {roles} for {self}')
        return roles

    def unique_keys(self, properties):
        """ VERY IMPORTANT: This function is required in all extensions of snovault, without it
            unique keys will NOT work!
        """
        keys = super(Item, self).unique_keys(properties)
        # Propagated to snovault as 1 May 2025 - Will
        # if 'accession' not in self.schema['properties']:
        #     return keys
        # keys.setdefault('accession', []).extend(properties.get('alternate_accessions', []))
        # if properties.get('status') != 'replaced' and 'accession' in properties:
        #     keys['accession'].append(properties['accession'])
        return keys

    @calculated_property(schema={"title": "Display Title", "type": "string"})
    def display_title(
        self,
        request: Request,
        title: Optional[str] = None,
        name: Optional[str] = None,
        external_id: Optional[str] = None,
        identifier: Optional[str] = None,
        submitted_id: Optional[str] = None,
        accession: Optional[str] = None,
        uuid: Optional[str] = None,
    ) -> Union[str, None]:
        """Generate display title with sane defaults for SMaHT."""
        if title:
            return title
        if name:
            return name
        if external_id:
            return external_id
        if identifier:
            return identifier
        if submitted_id:
            return submitted_id
        if accession:
            return accession
        return self.uuid


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


def validate_user_submission_consistency(context, request):
    """ Validates that a user who is not admin is submitting data
        under the consortia/submission centers that they are a
        part of
    """
    remote_user = get_remote_user(request)
    if not remote_user or is_special_user(remote_user):
        return
    user = get_item(request, remote_user, collection="User", frame="raw")
    if is_admin(user):
        return
    user_consortia = user.get('consortia', [])
    user_submission_centers = user.get('submission_centers', [])
    data = request.validated
    for consortium in data.get('consortia', []):
        if consortium not in user_consortia:
            request.errors.add('body', f'Item: invalid consortium {consortium}',
                                       f'user only has {user_consortia}')
    for submission_center in data.get('submission_centers', []):
        if submission_center not in user_submission_centers:
            request.errors.add('body', f'Item: invalid submission center {submission_center}',
                               f'user only has {user_submission_centers}')


def is_special_user(remote_user: str) -> bool:
    """Check for remote users with special status.

    May want to move these as a constant to project settings.
    """
    return remote_user in ['TEST', 'INDEXER', 'EMBED', 'TEST_SUBMITTER', 'INGESTION']


def is_admin(user: Dict[str, Any]) -> bool:
    """Is the user an admin?"""
    return "admin" in user.get("groups", [])


@view_config(
    context=SMAHTCollection,
    permission='add',
    request_method='POST',
    # validators=[]  # TURNS OFF VALIDATION HERE ([validate_item_content_post] previously)
    validators=[validate_item_content_post,
                validate_user_submission_consistency]
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
             validators=[validate_item_content_put,
                         validate_user_submission_consistency])
@view_config(context=Item, permission='edit', request_method='PATCH',
             validators=[validate_item_content_patch,
                         validate_user_submission_consistency])
@view_config(context=Item, permission='edit_unvalidated', request_method='PUT',
             validators=[no_validate_item_content_put,
                         validate_user_submission_consistency],
             request_param=['validate=false'])
@view_config(context=Item, permission='edit_unvalidated', request_method='PATCH',
             validators=[no_validate_item_content_patch,
                         validate_user_submission_consistency],
             request_param=['validate=false'])
@view_config(context=Item, permission='index', request_method='GET',
             validators=[validate_item_content_in_place,
                         validate_user_submission_consistency],
             request_param=['check_only=true'])
@debug_log
def item_edit(context, request, render=None):
    return sno_item_edit(context, request, render)
