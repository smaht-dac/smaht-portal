from snovault import collection, load_schema

from .preparation import Preparation


@collection(
    name="analyte-preparations",
    unique_key="analyte_preparation:submitted_id",
    properties={
        "title": "Analyte Preparations",
        "description": "Data on analyte extraction methods",
    })
class AnalytePreparation(Preparation):
    item_type = "analyte_preparation"
    schema = load_schema("encoded:schemas/analyte_preparation.json")
    embedded_list = []
