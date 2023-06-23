from copy import deepcopy
from snovault.validators import validate_item_content_post
from snovault.util import debug_log
from pyramid.authorization import Allow
from pyramid.view import view_config
from snovault import collection
from snovault.types.access_key import AccessKey as SnovaultAccessKey
from snovault.types.access_key import (
    access_key_add as sno_access_key_add,
    access_key_reset_secret as sno_access_key_reset_secret,
    access_key_view_raw as sno_access_key_view_raw
)
from .base import SMAHTItem, mixin_smaht_permission_types, DELETED_ACL
from .acl import ALLOW_AUTHENTICATED_CREATE_ACL, ONLY_ADMIN_VIEW_ACL


SNOVAULT_ACCESS_KEY_SCHEMA = deepcopy(SnovaultAccessKey.schema)


@collection(
    name='access-keys',
    unique_key='access_key:access_key_id',
    acl=ALLOW_AUTHENTICATED_CREATE_ACL,
    properties={
        'title': 'Access keys',
        'description': 'Programmatic access keys',
    },)
class AccessKey(SMAHTItem, SnovaultAccessKey):
    """AccessKey class."""
    ACCESS_KEY_EXPIRATION_TIME = 90  # days
    item_type = 'access_key'
    name_key = 'access_key_id'
    schema = mixin_smaht_permission_types(SNOVAULT_ACCESS_KEY_SCHEMA)
    embedded_list = []

    STATUS_ACL = {
        'current': [(Allow, 'role.owner', ['view', 'edit'])] + ONLY_ADMIN_VIEW_ACL,
        'deleted': DELETED_ACL,
    }

    class Collection(SMAHTItem.Collection):
        pass


@view_config(context=AccessKey.Collection, request_method='POST',
             permission='add',
             validators=[validate_item_content_post])
@debug_log
def access_key_add(context, request):
    return sno_access_key_add(context, request)


@view_config(name='reset-secret', context=AccessKey,
             permission='add',
             request_method='POST', subpath_segments=0)
@debug_log
def access_key_reset_secret(context, request):
    return sno_access_key_reset_secret(context, request)


@view_config(context=AccessKey, permission='view_raw', request_method='GET',
             name='raw')
@debug_log
def access_key_view_raw(context, request):
    return sno_access_key_view_raw(context, request)
