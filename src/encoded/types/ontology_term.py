from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


@collection(
    name="ontology-terms",
    unique_key="ontology_term:identifier",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "Ontology Terms",
        "description": "Restricted vocabulary terms for an ontology",
    },
)
class OntologyTerm(Item):
    item_type = "ontology_term"
    schema = load_schema("encoded:schemas/ontology_term.json")
    embedded_list = []
