from snovault import abstract_collection, load_schema

from .base import Item as SMAHTItem


@abstract_collection(
    name="samples",
    unique_key="submitted_id",
    properties={
        "title": "Samples",
        "description": "Samples from a living organism for subsequent analysis",
    },
)
class Sample(SMAHTItem):
    item_type = "sample"
    base_types = ["Sample"] + SMAHTItem.base_types
    schema = load_schema("encoded:schemas/sample.json")
    embedded_list = []
