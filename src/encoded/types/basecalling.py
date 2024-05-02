from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="basecalling",
    unique_key="submitted_id",
    properties={
        "title": "Basecalling",
        "description": "Details of basecalling for sequencing data",
    },
)
class Basecalling(SubmittedItem):
    item_type = "basecalling"
    schema = load_schema("encoded:schemas/basecalling.json")
    embedded_list = []
