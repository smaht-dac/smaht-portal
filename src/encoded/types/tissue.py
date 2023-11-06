from snovault import collection, load_schema

from .sample import Sample


@collection(
    name="tissues",
    unique_key="tissue:submitted_id",
    properties={
        "title": "Tissues",
        "description": "Tissues collected from an individual",
    })
class Tissue(Sample):
    item_type = "tissue"
    schema = load_schema("encoded:schemas/tissue.json")
    embedded_list = []
