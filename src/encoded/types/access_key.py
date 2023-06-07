from copy import deepcopy
from snovault import collection
from snovault.types.access_key import AccessKey as SnovaultAccessKey
from .base import SMAHTItem, mixin_smaht_permission_types
from .acl import ALLOW_AUTHENTICATED_CREATE_ACL


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
    schema = mixin_smaht_permission_types(SNOVAULT_ACCESS_KEY_SCHEMA)
