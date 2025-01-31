from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


@collection(
    name="ontologies",
    unique_key="ontology:identifier",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "Ontologies",
        "description": "Ontologies containing terms with restricted vocabulary",
    },
)
class Ontology(Item):
    item_type = "ontology"
    schema = load_schema("encoded:schemas/ontology.json")
    embedded_list = []
