from copy import deepcopy
from snovault import abstract_collection
from encoded_core.types.user_content import UserContent as CoreUserContent
from .base import Item as SMAHTItem
from .base import mixin_smaht_permission_types


ENCODED_CORE_USER_CONTENT_SCHEMA = deepcopy(CoreUserContent.schema)


@abstract_collection(
    name='user-content',
    properties={
        'title': 'Static Sections',
        'description': 'Static Sections for the Portal',
    })
class UserContent(SMAHTItem, CoreUserContent):
    item_type = 'user_content'
    schema = mixin_smaht_permission_types(ENCODED_CORE_USER_CONTENT_SCHEMA)
