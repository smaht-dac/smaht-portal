from snovault import collection, load_schema

from .base import Item


@collection(
    name="exposures",
    unique_key="submitted_id",
    properties={
        "title": "Exposures",
        "description": "Occupational and/or environmental exposures of donors",
    },
)
class Exposure(Item):
    item_type = "exposure"
    schema = load_schema("encoded:schemas/exposure.json")
    embedded_list = []
