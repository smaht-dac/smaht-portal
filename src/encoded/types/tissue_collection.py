from snovault import collection, load_schema

from .base import Item


@collection(
    name="tissue-collections",
    unique_key="submitted_id",
    properties={
        "title": "Tissue Collections",
        "description": "Details and methods of tissue collection for a donor",
    },
)
class TissueCollection(Item):
    item_type = "tissue_collection"
    schema = load_schema("encoded:schemas/tissue_collection.json")
    embedded_list = []
