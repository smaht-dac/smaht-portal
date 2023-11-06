from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="preparation-kits",
    unique_key="preparation_kit:submitted_id",
    properties={
        "title": "Preparation Kits",
        "description": "Kits used in processing biological material",
    },
)
class PreparationKit(SMAHTItem):
    item_type = "preparation_kit"
    schema = load_schema("encoded:schemas/preparation_kit.json")
    embedded_list = []
