from snovault import collection, load_schema

from .sample import Sample


@collection(
    name="cell-culture-samples",
    unique_key="cell_culture_sample:submitted_id",
    properties={
        "title": "Cell Culture Samples",
        "description": "Samples derived from cell culture",
    },
)
class CellCultureSample(Sample):
    item_type = "cell_culture_sample"
    schema = load_schema("encoded:schemas/cell_culture_sample.json")
    embedded_list = []
