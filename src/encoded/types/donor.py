from snovault import  collection, load_schema

from .abstract_donor import AbstractDonor

def _build_donor_embedded_list():
    """Embeds for search on donor."""
    return []


@collection(
    name="donors",
    unique_key="submitted_id",
    properties={
        "title": "Donors",
        "description": "Individuals who donated tissues",
    })
class Donor(AbstractDonor):
    item_type = "donor"
    schema = load_schema("encoded:schemas/donor.json")
    embedded_list = _build_donor_embedded_list()
