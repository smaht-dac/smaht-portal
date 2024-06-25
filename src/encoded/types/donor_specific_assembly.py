from snovault import collection, load_schema
from .submitted_item import SubmittedItem
from .reference_genome import ReferenceGenome

def _build_dsa_embedded_list():
    """Embeds for search on general files."""
    embedded_list = SubmittedItem.embedded_list + [
        "derived_from.libraries.analytes.samples.display_title",
        "derived_from.libraries.analytes.samples.sample_sources.submitted_id",
    ]
    return embedded_list


@collection(
    name="donor-specific-assemblies",
    unique_key="submitted_id",
    properties={
        "title": "Donor Specific Assembly",
        "description": "Donor-specific assembly",
    },
)
class DonorSpecificAssembly(SubmittedItem, ReferenceGenome):
    item_type = "donor_specific_assembly"
    base_types = ['DonorSpecificAssembly', ReferenceGenome.__name__] + SubmittedItem.base_types
    schema = load_schema("encoded:schemas/donor_specific_assembly.json")
    embedded_list = _build_dsa_embedded_list()
