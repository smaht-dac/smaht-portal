from encoded_core.types.document import Document as CoreDocument
from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name='documents',
    properties={
        'title': 'Documents',
        'description': 'Listing of Documents',
    })
class Document(SMAHTItem, CoreDocument):
    item_type = 'document'
    schema = load_schema("encoded:schemas/document.json")
    embedded_list = []
