from encoded_core.types.document import Document as CoreDocument
from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item as SMAHTItem


@collection(
    name='documents',
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Documents',
        'description': 'Listing of Documents',
    })
class Document(SMAHTItem, CoreDocument):
    item_type = 'document'
    schema = load_schema("encoded:schemas/document.json")
    embedded_list = []
