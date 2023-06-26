from snovault import collection

from .base import SMAHTItem, load_smaht_schema


@collection(
    name="protocols",
    unique_key="accession",
    properties={"title": "Protocols", "description": "Listing of protocols"},
)
class Protocol(SMAHTItem):
    item_type = "protocol"
    schema = load_smaht_schema(item_type)
