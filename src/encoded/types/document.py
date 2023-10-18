from encoded_core.types.document import Document as CoreDocument
from snovault import collection, load_schema

from .base import Item as SMAHTItem
from .acl import CONSORTIUM_MEMBER_CREATE_ACL


@collection(
    name='documents',
    acl=CONSORTIUM_MEMBER_CREATE_ACL,  # admins, consort/submission center members can create
    properties={
        'title': 'Documents',
        'description': 'Listing of Documents',
    })
class Document(SMAHTItem, CoreDocument):
    item_type = 'document'
    schema = load_schema("encoded:schemas/document.json")
