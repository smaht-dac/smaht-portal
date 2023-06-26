from snovault import collection

from .base import SMAHTItem, load_smaht_schema


@collection(
    name="biosources",
    unique_key="accession",
    properties={"title": "Biosources", "description": "Listing of biosources"},
)
class Biosource(SMAHTItem):
    item_type = "biosource"
    schema = load_smaht_schema(item_type)
