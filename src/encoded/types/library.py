from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="libraries",
    unique_key="library:submitted_id",
    properties={
        "title": "Libraries",
        "description": "Sequencing libraries",
    },
)
class Library(SMAHTItem):
    item_type = "library"
    schema = load_schema("encoded:schemas/library.json")
    embedded_list = []
