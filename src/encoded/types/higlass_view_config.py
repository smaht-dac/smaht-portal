from snovault import collection, load_schema
from encoded_core.types.higlass_view_config import HiglassViewConfig as CoreHiglassViewConfig
from .acl import ALLOW_CONSORTIUM_CREATE_ACL
from .base import Item as SMAHTItem


@collection(
    name='higlass-view-configs',
    unique_key='higlass_view_config:identifier',
    acl=ALLOW_CONSORTIUM_CREATE_ACL,
    properties={
        'title': 'HiGlass Displays',
        'description': 'Displays and view configurations for HiGlass',
    })
class HiglassViewConfig(SMAHTItem, CoreHiglassViewConfig):
    """
    Item type which contains a `view_config` property and other metadata.
    """
    item_type = 'higlass_view_config'
    schema = load_schema("encoded:schemas/higlass_view_config.json")
    embedded_list = []
    name_key = None
