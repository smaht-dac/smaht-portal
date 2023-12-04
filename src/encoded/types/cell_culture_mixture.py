from snovault import collection, load_schema

from .cell_culture import CellCulture


@collection(
    name="cell-culture-mixtures",
    unique_key="submitted_id",
    properties={
        "title": "Cell Culture Mixtures",
        "description": "Mixtures of cell cultures for further study",
    },
)
class CellCultureMixture(CellCulture):
    item_type = "cell_culture_mixture"
    schema = load_schema("encoded:schemas/cell_culture_mixture.json")
    embedded_list = []
