from copy import deepcopy
from snovault import collection
from encoded_core.types.document import Document as CoreDocument
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_DOCUMENT_SCHEMA = deepcopy(CoreDocument.schema)


@collection(
    name='documents',
    properties={
        'title': 'Documents',
        'description': 'Listing of Documents',
    })
class Document(SMAHTItem, CoreDocument):
    schema = mixin_smaht_permission_types(ENCODED_CORE_DOCUMENT_SCHEMA)
