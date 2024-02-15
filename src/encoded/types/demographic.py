from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="demographics",
    unique_key="submitted_id",
    properties={
        "title": "Demographics",
        "description": "Details of donors' demographics",
    },
)
class Demographic(SubmittedItem):
    item_type = "demographic"
    schema = load_schema("encoded:schemas/demographic.json")
    embedded_list = []
