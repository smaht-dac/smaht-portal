from snovault import collection, load_schema

from .submitted_item import SubmittedItem
from .reference_genome import ReferenceGenome


def _build_dsa_embedded_list():
    """Embeds for search on donor-specific assemblies."""
    return []


@collection(
    name="donor-specific-assemblies",
    unique_key="submitted_id",
    properties={
        "title": "Donor Specific Assemblies",
        "description": "Assembled donor-specific genomes for sequencing alignment",
    },
)
class DonorSpecificAssembly(ReferenceGenome, SubmittedItem):
    item_type = "donor_specific_assembly"
    base_types = [
        "DonorSpecificAssembly",
        ReferenceGenome.__name__,
    ] + SubmittedItem.base_types
    schema = load_schema("encoded:schemas/donor_specific_assembly.json")
    embedded_list = _build_dsa_embedded_list()
