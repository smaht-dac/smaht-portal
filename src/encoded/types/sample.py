from snovault import abstract_collection, load_schema

from .base import Item as SMAHTItem


@abstract_collection(
    name="samples",
    properties={
        "title": "Samples",
        "description": "Samples from a living organism for subsequent analysis",
    },
)
class Samples(SMAHTItem):
    item_type = "sample"
    schema = load_schema("encoded:schemas/sample.json")
    embedded_list = []
