from snovault import collection, load_schema

from .base import Item as SmahtItem


@collection(
    name="libraries",
    unique_key="submitted_id",
    properties={
        "title": "Libraries",
        "description": "Sequencing libraries",
    },
)
class Library(SmahtItem):
    item_type = "library"
    schema = load_schema("encoded:schemas/library.json")
    embedded_list = []
