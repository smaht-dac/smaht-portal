from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="cell-samples",
    unique_key="cell_sample:submitted_id",
    properties={
        "title": "Cell Samples",
        "description": "Samples consisting of isolated cells",
    },
)
class CellSample(SMAHTItem):
    item_type = "cell_sample"
    schema = load_schema("encoded:schemas/cell_sample.json")
    embedded_list = []
