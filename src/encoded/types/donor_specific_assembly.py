from snovault import collection, load_schema

from .submitted_item import SubmittedItem


def _build_dsa_embedded_list():
    """Embeds for search on donor-specific assemblies."""
    return []


@collection(
    name="donor-specific-assemblies",
    unique_key="donor_specific_assembly:submitted_id",
    properties={
        "title": "Donor Specific Assemblies",
        "description": "Assembled donor-specific genomes for sequencing alignment",
    },
)
class DonorSpecificAssembly(SubmittedItem):
    item_type = "donor_specific_assembly"
    schema = load_schema("encoded:schemas/donor_specific_assembly.json")
    embedded_list = _build_dsa_embedded_list()
