from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="protocols",
    unique_key="protocol:submitted_id",
    properties={
        "title": "Protocols",
        "description": "Detailed descriptions of experimental details",
    },
)
class Protocol(SMAHTItem):
    item_type = "protocol"
    schema = load_schema("encoded:schemas/protocol.json")
    embedded_list = []
