from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="exposures",
    unique_key="submitted_id",
    properties={
        "title": "Exposures",
        "description": "Occupational and/or environmental exposures of donors",
    },
)
class Exposure(SubmittedItem):
    item_type = "exposure"
    schema = load_schema("encoded:schemas/exposure.json")
    embedded_list = []
