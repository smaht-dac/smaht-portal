from snovault import collection, load_schema

from .base import Item


@collection(
    name="libraries",
    unique_key="submitted_id",
    properties={
        "title": "Libraries",
        "description": "Sequencing libraries",
    },
)
class Library(Item):
    item_type = "library"
    schema = load_schema("encoded:schemas/library.json")
    embedded_list = []
