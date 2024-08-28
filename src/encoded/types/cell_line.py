from snovault import collection, load_schema

from .submitted_item import SubmittedItem

@collection(
    name="cell-lines",
    unique_key="submitted_id",
    properties={
        "title": "Cell Lines",
        "description": "Cell lines",
    },
)
class CellLine(SubmittedItem):
    item_type = "cell_line"
    schema = load_schema("encoded:schemas/cell_line.json")
    embedded_list = []