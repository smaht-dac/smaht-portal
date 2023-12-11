from snovault import abstract_collection, load_schema

from .base import Item


@abstract_collection(
    name="sample-sources",
    unique_key="submitted_id",
    properties={
        "title": "Sample Sources",
        "description": "Source material for samples",
    },
)
class SampleSource(Item):
    item_type = "sample_source"
    base_types = ["SampleSource"] + Item.base_types
    schema = load_schema("encoded:schemas/sample_source.json")
    embedded_list = []
