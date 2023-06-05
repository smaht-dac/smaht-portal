from snovault import collection
from encoded_core.types.document import Document as CoreDocument
from .base import SMAHTItem


@collection(
    name='documents',
    properties={
        'title': 'Documents',
        'description': 'Listing of Documents',
    })
class Document(SMAHTItem, CoreDocument):
    pass
