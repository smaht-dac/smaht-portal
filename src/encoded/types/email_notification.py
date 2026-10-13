from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


@collection(
    name='email-notifications',
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Email Notifications',
        'description': 'Listing of Email Notifications',
    })
class EmailNotification(Item):
    item_type = 'email_notification'
    schema = load_schema("encoded:schemas/email_notification.json")
    embedded_list = []

    def __acl__(self):
        """ Admin-only at the item level, not just the collection level.

            Item.__acl__ keys off `submission_centers` before status, and the
            attribution mixin fills that in from the submitting user, so the
            inherited 'in review' ACL would make a notification viewable and
            editable by every member of the author's submission center.
        """
        return ONLY_ADMIN_VIEW_ACL
