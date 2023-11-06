from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="diagnoses",
    unique_key="diagnosis:submitted_id",
    properties={
        "title": "Diagnoses",
        "description": "Diseases diagnosed for donors",
    },
)
class Diagnosis(SMAHTItem):
    item_type = "diagnosis"
    schema = load_schema("encoded:schemas/diagnosis.json")
    embedded_list = []
