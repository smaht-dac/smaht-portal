from snovault import collection, load_schema

from .submitted_item import SubmittedItem


@collection(
    name="treatments",
    unique_key="submitted_id",
    properties={
        "title": "Treatments",
        "description": "Biological, chemical, or physical agent used during an experiment",
    },
)
class Treatment(SubmittedItem):
    item_type = "treatment"
    schema = load_schema("encoded:schemas/treatment.json")
    embedded_list = []
