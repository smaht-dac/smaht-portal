from snovault import collection, load_schema

from .base import Item as SmahtItem


@collection(
    name="cell-cultures",
    unique_key="submitted_id",
    properties={
        "title": "Cell Cultures",
        "description": "Conditions for growing cells",
    },
)
class CellCulture(SmahtItem):
    item_type = "cell_culture"
    schema = load_schema("encoded:schemas/cell_culture.json")
    embedded_list = []
