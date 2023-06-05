from snovault import collection
from encoded_core.types.tracking_item import TrackingItem as CoreTrackingItem
from .base import SMAHTItem


@collection(
    name='tracking-items',
    properties={
        'title': 'TrackingItem',
        'description': 'For internal tracking of ENCODED events',
    })
class TrackingItem(SMAHTItem, CoreTrackingItem):
    pass
