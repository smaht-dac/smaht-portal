from snovault import collection

from .base import SMAHTItem, load_smaht_schema


@collection(
    name="biosamples",
    unique_key="accession",
    properties={"title": "Biosamples", "description": "Listing of biosamples"},
)
class Biosample(SMAHTItem):
    item_type = "biosample"
    schema = load_smaht_schema(item_type)
