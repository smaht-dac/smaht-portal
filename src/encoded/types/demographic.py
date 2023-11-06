from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="demographics",
    unique_key="demographic:submitted_id",
    properties={
        "title": "Demographics",
        "description": "Details of donors' demographics",
    },
)
class Demographic(SMAHTItem):
    item_type = "demographic"
    schema = load_schema("encoded:schemas/demographic.json")
    embedded_list = []
