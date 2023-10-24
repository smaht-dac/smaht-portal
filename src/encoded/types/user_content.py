from snovault import abstract_collection, load_schema
from encoded_core.types.user_content import UserContent as CoreUserContent

from .base import Item as SMAHTItem


@abstract_collection(
    name='user-contents',
    properties={
        'title': 'User Content',
        'description': 'User Content for the Portal',
    })
class UserContent(SMAHTItem, CoreUserContent):
    item_type = 'user_content'
    schema = load_schema("encoded:schemas/user_content.json")
    embedded_list = []
