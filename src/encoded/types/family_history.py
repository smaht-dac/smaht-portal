from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="family-histories",
    unique_key="submitted_id",
    properties={
        "title": "Family Histories",
        "description": "Family histories for donors",
    },
)
class FamilyHistory(SubmittedItem):
    item_type = "family_history"
    schema = load_schema("encoded:schemas/family_history.json")
    embedded_list = []
