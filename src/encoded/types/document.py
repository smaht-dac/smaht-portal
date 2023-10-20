from encoded_core.types.document import Document as CoreDocument
from snovault import collection, calculated_property, load_schema
from .acl import CONSORTIUM_MEMBER_CREATE_ACL
from .base import Item as SMAHTItem


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

    @calculated_property(schema={
        "title": "Display Title",
        "description": "Document filename, if available.",
        "type": "string"
    })
    def display_title(self, attachment=None):
        return CoreDocument.display_title(self, attachment=attachment)
