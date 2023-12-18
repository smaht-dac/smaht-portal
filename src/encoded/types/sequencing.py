from snovault import collection, load_schema

from .base import Item


@collection(
    name="Sequencing",
    unique_key="submitted_id",
    properties={
        "title": "Sequencing",
        "description": "Details of library sequencing",
    },
)
class Sequencing(Item):
    item_type = "sequencing"
    schema = load_schema("encoded:schemas/sequencing.json")
    embedded_list = []
