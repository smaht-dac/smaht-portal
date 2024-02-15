from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="therapeutics",
    unique_key="submitted_id",
    properties={
        "title": "Therapeutics",
        "description": "Disease treatments associated with a donor",
    },
)
class Therapeutic(SubmittedItem):
    item_type = "therapeutic"
    schema = load_schema("encoded:schemas/therapeutic.json")
    embedded_list = []
