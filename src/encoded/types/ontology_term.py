from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="ontology-terms",
    unique_key="ontology_term:identifier",
    properties={
        "title": "Ontology Terms",
        "description": "Restricted vocabulary terms for an ontology",
    },
)
class OntologyTerm(SMAHTItem):
    item_type = "ontology_term"
    schema = load_schema("encoded:schemas/ontology_term.json")
    embedded_list = []
