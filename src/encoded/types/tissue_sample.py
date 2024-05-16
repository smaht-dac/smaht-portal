from typing import List

from snovault import collection, load_schema

from .sample import Sample


def _build_tissue_sample_embedded_list() -> List[str]:
    return [
        # Columns/facets for search
        "sample_sources.external_id",
        "sample_sources.donor.external_id",
    ]


@collection(
    name="tissue-samples",
    unique_key="submitted_id",
    properties={
        "title": "Tissue Samples",
        "description": "Samples derived from a tissue",
    },
)
class TissueSample(Sample):
    item_type = "tissue_sample"
    schema = load_schema("encoded:schemas/tissue_sample.json")
    embedded_list = []
