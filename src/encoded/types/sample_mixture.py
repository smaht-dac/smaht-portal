from snovault import collection, load_schema

from .sample import Sample


@collection(
    name="sample-mixtures",
    unique_key="sample_mixture:submitted_id",
    properties={
        "title": "Sample Mixtures",
        "description": "Mixtures of samples for further study",
    },
)
class SampleMixture(Sample):
    item_type = "sample_mixture"
    schema = load_schema("encoded:schemas/sample_mixture.json")
    embedded_list = []
