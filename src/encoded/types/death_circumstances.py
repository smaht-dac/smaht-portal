from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="death_circumstances",
    unique_key="death_circumstances:submitted_id",
    properties={
        "title": "Death Circumstances",
        "description": "Details of a donor's death",
    },
)
class DeathCircumstances(SMAHTItem):
    item_type = "death_circumstances"
    schema = load_schema("encoded:schemas/death_circumstances.json")
    embedded_list = []
