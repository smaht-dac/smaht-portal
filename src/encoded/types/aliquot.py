from snovault import collection

from .base import SMAHTItem, load_smaht_schema


@collection(
    name="aliquots",
    unique_key="accession",
    properties={"title": "Aliquots", "description": "Listing of aliquots"},
)
class Aliquot(SMAHTItem):
    item_type = "aliquot"
    schema = load_smaht_schema(item_type)
