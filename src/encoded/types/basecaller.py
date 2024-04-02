from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="basecallers",
    unique_key="submitted_id",
    properties={
        "title": "Basecallers",
        "description": "Basecallers used to generate sequence reads from raw data",
    },
)
class Basecaller(SubmittedItem):
    item_type = "basecaller"
    schema = load_schema("encoded:schemas/basecaller.json")
    embedded_list = []
