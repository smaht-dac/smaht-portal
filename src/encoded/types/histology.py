from snovault import collection, load_schema

from .base import Item


@collection(
    name="histologies",
    unique_key="submitted_id",
    properties={
        "title": "Histologies",
        "description": "Histological analyses of tissues",
    },
)
class Histology(Item):
    item_type = "histology"
    schema = load_schema("encoded:schemas/histology.json")
    embedded_list = []
