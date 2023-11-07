from snovault import collection, load_schema

from .base import Item as SmahtItem


@collection(
    name="treatments",
    unique_key="treatment:submitted_id",
    properties={
        "title": "Treatments",
        "description": "Biological, chemical, or physical agent used during an experiment",
    },
)
class Treatment(SmahtItem):
    item_type = "treatment"
    schema = load_schema("encoded:schemas/treatment.json")
    embedded_list = []
