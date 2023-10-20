from copy import deepcopy
from snovault import collection, calculated_property
from encoded_core.types.tracking_item import TrackingItem as CoreTrackingItem
from .base import Item as SMAHTItem
from .base import mixin_smaht_permission_types


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

    @calculated_property(schema={
        "title": "Display Title",
        "description": "Descriptor of TrackingItem",
        "type": "string"
    })
    def display_title(self, tracking_type, date_created=None, google_analytics=None):
        return CoreTrackingItem.display_title(self, tracking_type, date_created=date_created,
                                              google_analytics=google_analytics)
