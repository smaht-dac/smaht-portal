from snovault import collection, load_schema

from .base import Item


@collection(
    name="death-circumstances",
    unique_key="submitted_id",
    properties={
        "title": "Death Circumstances",
        "description": "Details of a donor's death",
    },
)
class DeathCircumstances(Item):
    item_type = "death_circumstances"
    schema = load_schema("encoded:schemas/death_circumstances.json")
    embedded_list = []
