from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .submitted_item import SubmittedItem
from .reference_genome import ReferenceGenome


def _build_dsa_embedded_list():
    """Embeds for search on donor-specific assemblies."""
    return []

@collection(
    name="donor-specific-assembly",
    unique_key="donor_specific_assembly:submitted_id",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "Donor Specific Assembly",
        "description": "Assembled donor-specific genomes for sequencing alignment",
    },
)
class DonorSpecificAssembly(SubmittedItem, ReferenceGenome):
    item_type = "donor_specific_assembly"
    schema = load_schema("encoded:schemas/donor_specific_assembly.json")
    embedded_list = _build_dsa_embedded_list()
