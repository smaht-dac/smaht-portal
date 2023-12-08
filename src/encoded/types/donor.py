from snovault import collection, load_schema

from .base import Item


@collection(
    name="donors",
    unique_key="submitted_id",
    properties={
        "title": "Donors",
        "description": "Individuals who donated tissues",
    })
class Donor(Item):
    item_type = "donor"
    schema = load_schema("encoded:schemas/donor.json")
    embedded_list = []
