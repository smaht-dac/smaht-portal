from snovault import collection, load_schema

from .sample_source import SampleSource


@collection(
    name="cell-culture-mixtures",
    unique_key="submitted_id",
    properties={
        "title": "Cell Culture Mixtures",
        "description": "Mixtures of cell cultures for further study",
    },
)
class CellCultureMixture(SampleSource):
    item_type = "cell_culture_mixture"
    schema = load_schema("encoded:schemas/cell_culture_mixture.json")
    embedded_list = []
