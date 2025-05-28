from snovault import collection, load_schema

from .sample import Sample


@collection(
    name="cell-samples",
    unique_key="submitted_id",
    properties={
        "title": "Cell Samples",
        "description": "Samples consisting of isolated cells",
    },
)
class CellSample(Sample):
    item_type = "cell_sample"
    schema = load_schema("encoded:schemas/cell_sample.json")
    embedded_list = Sample.embedded_list
