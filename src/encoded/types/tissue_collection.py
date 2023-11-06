from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="tissue-collections",
    unique_key="tissue_collection:identifier",
    properties={
        "title": "Tissue Collections",
        "description": "Details and methods of tissue collection for a donor",
    },
)
class TissueCollection(SMAHTItem):
    item_type = "tissue_collection"
    schema = load_schema("encoded:schemas/tissue_collection.json")
    embedded_list = []
