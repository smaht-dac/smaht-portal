from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="medical_histories",
    unique_key="medical_history:submitted_id",
    properties={
        "title": "Medical Histories",
        "description": "Medical histories for donors",
    })
class MedicalHistory(SMAHTItem):
    item_type = "medical_history"
    schema = load_schema("encoded:schemas/medical_history.json")
    embedded_list = []
