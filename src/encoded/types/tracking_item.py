from typing import Any, Dict, Optional, List

from snovault import collection, load_schema, calculated_property, Item as SnovaultItem
from encoded_core.types.tracking_item import TrackingItem as CoreTrackingItem

# from .acl import ONLY_ADMIN_VIEW_ACL, ALLOW_OWNER_EDIT_ACL
from .base import Item

@collection(
    name='tracking-items',
    properties={
        "title": "TrackingItem",
        "description": "For internal tracking of Fourfront events",
    })
class TrackingItem(Item, CoreTrackingItem):
    item_type = 'tracking_item'
    schema = load_schema("encoded:schemas/tracking_item.json")
    embedded_list = []

    def _update(self, properties: Dict[str, Any], sheets: Optional[List] = None) -> None:
        return SnovaultItem._update(self, properties, sheets)
    
    @calculated_property(schema={
        "title": "Title",
        "type": "string",
    })
    def display_title(self, tracking_type, date_created=None, google_analytics=None):
        if date_created:  # pragma: no cover should always be true
            date_created = date_created[:10]
        if tracking_type == 'google_analytics':
            for_date = None
            if google_analytics:
                for_date = google_analytics.get('for_date', None)
            if for_date:
                return 'Google Analytics for ' + for_date
            return 'Google Analytics Item'
        elif tracking_type == 'download_tracking':
            title = 'Download Tracking Item'
            if date_created:
                title = title + ' from ' + date_created
            return title
        else:
            title = 'Tracking Item'
            if date_created:
                title = title + ' from ' + date_created
            return title