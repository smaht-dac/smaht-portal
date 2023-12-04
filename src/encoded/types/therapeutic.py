from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="therapeutics",
    unique_key="submitted_id",
    properties={
        "title": "Therapeutics",
        "description": "Disease treatments associated with a donor",
    },
)
class Therapeutic(SMAHTItem):
    item_type = "therapeutic"
    schema = load_schema("encoded:schemas/therapeutic.json")
    embedded_list = []
