from snovault import collection, load_schema

from .preparation import Preparation


@collection(
    name="sample-preparations",
    unique_key="submitted_id",
    properties={
        "title": "Sample Preparations",
        "description": "Data on sample preparation methods",
    },
)
class SamplePreparation(Preparation):
    item_type = "sample_preparation"
    schema = load_schema("encoded:schemas/sample_preparation.json")
    embedded_list = []
