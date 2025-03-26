from snovault import abstract_collection, load_schema

from .submitted_item import SubmittedItem


@abstract_collection(
    name="samples",
    unique_key="submitted_id",
    properties={
        "title": "Samples",
        "description": "Samples from a living organism for subsequent analysis",
    },
)
class Sample(SubmittedItem):
    item_type = "sample"
    base_types = ["Sample"] + SubmittedItem.base_types
    schema = load_schema("encoded:schemas/sample.json")
    embedded_list = [
        "sample_sources.*",  # this will capture everything of note for the manifest file
        "sample_sources.donor.accession"
    ]
