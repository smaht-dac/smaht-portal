from snovault import collection, load_schema

from .sample_source import SampleSource


@collection(
    name="cell-cultures",
    unique_key="submitted_id",
    properties={
        "title": "Cell Cultures",
        "description": "Conditions for growing cells",
    },
)
class CellCulture(SampleSource):
    item_type = "cell_culture"
    schema = load_schema("encoded:schemas/cell_culture.json")
    embedded_list = []
