from copy import deepcopy
from snovault import collection
from encoded_core.types.document import Document as CoreDocument
from .base import SMAHTItem, mixin_smaht_permission_types
from .acl import CONSORTIUM_MEMBER_CREATE_ACL


ENCODED_CORE_DOCUMENT_SCHEMA = deepcopy(CoreDocument.schema)


@collection(
    name='documents',
    acl=CONSORTIUM_MEMBER_CREATE_ACL,  # admins, consort/submission center members can create
    properties={
        'title': 'Documents',
        'description': 'Listing of Documents',
    })
class Document(SMAHTItem, CoreDocument):
    item_type = 'document'
    schema = mixin_smaht_permission_types(ENCODED_CORE_DOCUMENT_SCHEMA)
