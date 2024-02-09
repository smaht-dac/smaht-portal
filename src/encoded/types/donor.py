from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="donors",
    unique_key="submitted_id",
    properties={
        "title": "Donors",
        "description": "Individuals who donated tissues",
    })
class Donor(SubmittedItem):
    item_type = "donor"
    schema = load_schema("encoded:schemas/donor.json")
    embedded_list = []
