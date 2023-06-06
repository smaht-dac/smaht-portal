from copy import deepcopy
from snovault import collection
from snovault.types.access_key import AccessKey as SnovaultAccessKey
from .base import SMAHTItem, mixin_smaht_permission_types


SNOVAULT_ACCESS_KEY_SCHEMA = deepcopy(SnovaultAccessKey.schema)


@collection(
    name='access-keys',
    unique_key='access_key:access_key_id',
    properties={
        'title': 'Access keys',
        'description': 'Programmatic access keys',
    },)
class AccessKey(SMAHTItem, SnovaultAccessKey):
    """AccessKey class."""
    schema = mixin_smaht_permission_types(SNOVAULT_ACCESS_KEY_SCHEMA)
