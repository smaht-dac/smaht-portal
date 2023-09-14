from snovault import collection, load_schema
from snovault.types.user import User as SnovaultUser

from .base import Item as SMAHTItem


@collection(
    name='users',
    unique_key='user:email',
    properties={
        'title': 'SMaHT Users',
        'description': 'Listing of current SMaHT users',
    }
)
class User(SMAHTItem, SnovaultUser):
    item_type = 'user'
    schema = load_schema("encoded:schemas/user.json")
    STATUS_ACL = SMAHTItem.STATUS_ACL

    def __ac_local_roles__(self):
        return SMAHTItem.__ac_local_roles__(self)
