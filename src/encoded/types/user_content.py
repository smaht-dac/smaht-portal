from typing import Any, Dict, Optional

from snovault import abstract_collection, Item as SnovaultItem, load_schema
from encoded_core.types.user_content import UserContent as CoreUserContent

from .base import Item as SMAHTItem


@abstract_collection(
    name='user-contents',
    properties={
        'title': 'User Content',
        'description': 'User content for the Portal',
    })
class UserContent(SMAHTItem, CoreUserContent):
    item_type = 'user_content'
    schema = load_schema("encoded:schemas/user_content.json")
    embedded_list = []

    def _update(self, properties: Dict[str, Any], sheets: Optional[Dict] = None) -> None:
        return SnovaultItem._update(self, properties, sheets=sheets)
