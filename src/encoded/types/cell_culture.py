from snovault import collection, load_schema

from .sample_source import SampleSource


def _build_cell_culture_embedded_list():
    """Embeds for search on cell cultures."""
    return [
        "cell_line.code",
    ]


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
    base_types = ["CellCulture"] + SampleSource.base_types
    schema = load_schema("encoded:schemas/cell_culture.json")
    embedded_list = _build_cell_culture_embedded_list()
