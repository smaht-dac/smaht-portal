from snovault import collection, load_schema

from .base import Item


@collection(
    name="sequencers",
    unique_key="sequencer:identifier",
    properties={
        "title": "Sequencer",
        "description": "Sequencing machine used for data generation",
    },
)
class Sequencer(Item):
    item_type = "sequencer"
    schema = load_schema("encoded:schemas/sequencer.json")
    embedded_list = []
