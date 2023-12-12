from snovault import collection, load_schema

from .base import Item


@collection(
    name="medical-histories",
    unique_key="submitted_id",
    properties={
        "title": "Medical Histories",
        "description": "Medical histories for donors",
    },
)
class MedicalHistory(Item):
    item_type = "medical_history"
    schema = load_schema("encoded:schemas/medical_history.json")
    embedded_list = []
