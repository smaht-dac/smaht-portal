from copy import deepcopy
from snovault import collection
from encoded_core.types.tracking_item import TrackingItem as CoreTrackingItem
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_TRACKING_ITEM_SCHEMA = deepcopy(CoreTrackingItem.schema)


@collection(
    name='tracking-items',
    properties={
        'title': 'TrackingItem',
        'description': 'For internal tracking of ENCODED events',
    })
class TrackingItem(SMAHTItem, CoreTrackingItem):
    item_type = 'tracking_item'
    schema = mixin_smaht_permission_types(ENCODED_CORE_TRACKING_ITEM_SCHEMA)
