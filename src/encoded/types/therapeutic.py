from snovault import collection, load_schema

from .base import Item


@collection(
    name="therapeutics",
    unique_key="submitted_id",
    properties={
        "title": "Therapeutics",
        "description": "Disease treatments associated with a donor",
    },
)
class Therapeutic(Item):
    item_type = "therapeutic"
    schema = load_schema("encoded:schemas/therapeutic.json")
    embedded_list = []
