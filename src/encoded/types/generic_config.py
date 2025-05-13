from snovault import abstract_collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


@abstract_collection(
    name='generic-configs',
    unique_key='generic_config:identifier',
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Generic Config',
        'description': 'Configurations for general use',
    })
class GenericConfig(Item):
    """
    Item type which contains a JSON `body` property and other metadata.
    """
    item_type = 'generic_config'
    schema = load_schema("encoded:schemas/generic_config.json")
    embedded_list = []
    name_key = None
