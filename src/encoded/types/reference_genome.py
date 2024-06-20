from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item
from .submitted_item import SubmittedItem


@collection(
    name="reference-genomes",
    unique_key="reference_genome:submitted_id",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "Reference Genomes",
        "description": "Assembled genomes for sequencing alignment",
    },
)
class ReferenceGenome(Item, SubmittedItem):
    item_type = "reference_genome"
    schema = load_schema("encoded:schemas/reference_genome.json")
    embedded_list = []
