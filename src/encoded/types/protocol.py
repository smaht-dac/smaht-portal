from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


@collection(
    name="protocols",
    unique_key="protocol:identifier",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "Protocols",
        "description": "Detailed descriptions of experimental details",
    },
)
class Protocol(Item):
    item_type = "protocol"
    schema = load_schema("encoded:schemas/protocol.json")
    embedded_list = []
