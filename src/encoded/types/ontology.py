from snovault import collection

from .base import SMAHTItem, load_smaht_schema


@collection(
    name="ontologies",
    unique_key="accession",
    properties={"title": "Ontologies", "description": "Listing of ontologies"},
)
class Ontology(SMAHTItem):
    item_type = "ontology"
    schema = load_smaht_schema(item_type)
