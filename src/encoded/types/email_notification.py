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
