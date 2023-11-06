from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="exposures",
    unique_key="exposure:submitted_id",
    properties={
        "title": "Exposures",
        "description": "Occupational and/or environmental exposures of donors",
    })
class Exposure(SMAHTItem):
    item_type = "exposure"
    schema = load_schema("encoded:schemas/exposure.json")
    embedded_list = []
