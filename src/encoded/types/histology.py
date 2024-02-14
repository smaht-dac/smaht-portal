from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="histologies",
    unique_key="submitted_id",
    properties={
        "title": "Histologies",
        "description": "Histological analyses of tissues",
    },
)
class Histology(SubmittedItem):
    item_type = "histology"
    schema = load_schema("encoded:schemas/histology.json")
    embedded_list = []
