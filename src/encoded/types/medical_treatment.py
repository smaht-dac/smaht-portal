from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="medical-treatments",
    unique_key="submitted_id",
    properties={
        "title": "Medical Treatments",
        "description": "Medical treatments received by donors",
    },
)
class MedicalTreatment(SubmittedItem):
    item_type = "medical_treatment"
    schema = load_schema("encoded:schemas/medical_treatment.json")
    embedded_list = []
