from snovault import collection, load_schema

from .base import Item as SmahtItem


@collection(
    name="death-circumstances",
    unique_key="death_circumstances:submitted_id",
    properties={
        "title": "Death Circumstances",
        "description": "Details of a donor's death",
    },
)
class DeathCircumstances(SmahtItem):
    item_type = "death_circumstances"
    schema = load_schema("encoded:schemas/death_circumstances.json")
    embedded_list = []
