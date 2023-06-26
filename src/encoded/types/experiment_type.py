from snovault import collection

from .base import SMAHTItem, load_smaht_schema


@collection(
    name="experiment-types",
    unique_key="accession",
    properties={"title": "Experiment Types", "description": "Listing of experiment types"},
)
class ExperimentType(SMAHTItem):
    item_type = "experiment_type"
    schema = load_smaht_schema(item_type)
