from snovault import collection, load_schema

from .base import Item


@collection(
    name="tissues",
    unique_key="submitted_id",
    properties={
        "title": "Tissues",
        "description": "Tissues collected from an individual",
    },
)
class Tissue(Item):
    item_type = "tissue"
    schema = load_schema("encoded:schemas/tissue.json")
    embedded_list = []
