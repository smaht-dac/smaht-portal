from typing import List

from snovault import collection, load_schema

from .sample_source import SampleSource


def _build_tissue_embedded_list() -> List[str]:
    return [
        "donor.external_id",
        "uberon_id.identifier",
        "uberon_id.grouping_term",
    ]


@collection(
    name="tissues",
    unique_key="submitted_id",
    properties={
        "title": "Tissues",
        "description": "Tissues collected from an individual",
    },
)
class Tissue(SampleSource):
    item_type = "tissue"
    schema = load_schema("encoded:schemas/tissue.json")
    embedded_list = _build_tissue_embedded_list()
