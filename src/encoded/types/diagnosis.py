from snovault import collection, load_schema

from .base import Item


@collection(
    name="diagnoses",
    unique_key="submitted_id",
    properties={
        "title": "Diagnoses",
        "description": "Diseases diagnosed for donors",
    },
)
class Diagnosis(Item):
    item_type = "diagnosis"
    schema = load_schema("encoded:schemas/diagnosis.json")
    embedded_list = []
