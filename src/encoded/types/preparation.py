from snovault import abstract_collection, load_schema

from .base import Item


@abstract_collection(
    name="preparations",
    unique_key="submitted_id",
    properties={
        "title": "Preparation",
        "description": "Data on methods used to process a biological entity",
    },
)
class Preparation(Item):
    item_type = "preparation"
    base_types = ["Preparation"] + Item.base_types
    schema = load_schema("encoded:schemas/preparation.json")
    embedded_list = []
