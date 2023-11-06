from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="analytes",
    unique_key="analyte:submitted_id",
    properties={
        "title": "Analytes",
        "description": "Molecules extracted from samples for subsequent analysis",
    })
class Analyte(SMAHTItem):
    item_type = "analyte"
    schema = load_schema("encoded:schemas/analyte.json")
    embedded_list = []
