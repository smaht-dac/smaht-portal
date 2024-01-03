from snovault import collection, load_schema

from .base import SubmittedItem


@collection(
    name="analytes",
    unique_key="submitted_id",
    properties={
        "title": "Analytes",
        "description": "Molecules extracted from samples for subsequent analysis",
    },
)
class Analyte(SubmittedItem):
    item_type = "analyte"
    schema = load_schema("encoded:schemas/analyte.json")
    embedded_list = []
