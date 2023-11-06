from snovault import collection, load_schema

from .sample import Sample


@collection(
    name="tissue-samples",
    unique_key="tissue_sample:submitted_id",
    properties={
        "title": "Tissue Samples",
        "description": "Samples derived from a tissue",
    },
)
class TissueSample(Sample):
    item_type = "tissue_sample"
    schema = load_schema("encoded:schemas/tissue_sample.json")
    embedded_list = []
