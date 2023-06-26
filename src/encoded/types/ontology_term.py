from snovault import collection

from .base import SMAHTItem, load_smaht_schema


@collection(
    name="ontology-terms",
    unique_key="accession",
    properties={"title": "Ontoloty Terms", "description": "Listing of ontology terms"},
)
class OntologyTerm(SMAHTItem):
    item_type = "ontology_term"
    schema = load_smaht_schema(item_type)
