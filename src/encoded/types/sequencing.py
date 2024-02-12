from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="Sequencing",
    unique_key="submitted_id",
    properties={
        "title": "Sequencing",
        "description": "Details of library sequencing",
    },
)
class Sequencing(SubmittedItem):
    item_type = "sequencing"
    schema = load_schema("encoded:schemas/sequencing.json")
    embedded_list = []
