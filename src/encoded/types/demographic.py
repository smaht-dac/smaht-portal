from snovault import collection, load_schema

from .base import Item


@collection(
    name="demographics",
    unique_key="submitted_id",
    properties={
        "title": "Demographics",
        "description": "Details of donors' demographics",
    },
)
class Demographic(Item):
    item_type = "demographic"
    schema = load_schema("encoded:schemas/demographic.json")
    embedded_list = []
