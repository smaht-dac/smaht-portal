from snovault import collection
from snovault.types.access_key import AccessKey as SnovaultAccessKey
from .base import SMAHTItem


@collection(
    name='access-keys',
    unique_key='access_key:access_key_id',
    properties={
        'title': 'Access keys',
        'description': 'Programmatic access keys',
    },)
class AccessKey(SMAHTItem, SnovaultAccessKey):
    """AccessKey class."""
    pass
