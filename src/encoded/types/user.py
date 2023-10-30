from typing import Optional, Union

from snovault import calculated_property, collection, load_schema
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
    embedded_list = []

#    STATUS_ACL = SMAHTItem.STATUS_ACL
#
#    def __ac_local_roles__(self):
#        return SMAHTItem.__ac_local_roles__(self)

    @calculated_property(schema={"title": "Title", "type": "string"})
    def title(self, first_name: Optional[str], last_name: Optional[str]) -> Union[str, None]:
        if first_name and last_name:
            return SnovaultUser.title(self, first_name, last_name)

    @calculated_property(
        schema={"title": "Contact Email", "type": "string", "format": "email"}
    )
    def contact_email(
        self, email: Optional[str] = None, preferred_email: Optional[str] = None
    ) -> Union[str, None]:
        return SnovaultUser.contact_email(self, email, preferred_email=preferred_email)
