from snovault import collection, load_schema

from .base import Item


@collection(
    name="preparation-kits",
    unique_key="submitted_id",
    properties={
        "title": "Preparation Kits",
        "description": "Kits used in processing biological material",
    },
)
class PreparationKit(Item):
    item_type = "preparation_kit"
    schema = load_schema("encoded:schemas/preparation_kit.json")
    embedded_list = []
