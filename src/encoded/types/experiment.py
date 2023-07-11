from snovault import collection

from .base import SMAHTItem, load_smaht_schema


@collection(
    name="experiments",
    unique_key="accession",
    properties={"title": "Experiments", "description": "Listing of experiments"},
)
class Experiment(SMAHTItem):
    item_type = "experiment"
    schema = load_smaht_schema(item_type)
