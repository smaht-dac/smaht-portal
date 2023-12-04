from snovault import collection, load_schema

from .subject import Subject


@collection(
    name="donors",
    unique_key="submitted_id",
    properties={
        "title": "Donors",
        "description": "Individuals who donated tissues",
    })
class Donor(Subject):
    item_type = "donor"
    schema = load_schema("encoded:schemas/donor.json")
    embedded_list = []
