from snovault import abstract_collection, load_schema

from .base import Item as SMAHTItem


@abstract_collection(
    name="preparation",
    properties={
        "title": "Preparation",
        "description": "Data on methods used to process a biological entity",
    },
)
class Preparation(SMAHTItem):
    item_type = "preparation"
    schema = load_schema("encoded:schemas/preparation.json")
	embedded_list = []
