from snovault import collection, load_schema

from .submitted_file import SubmittedFile


def _build_dsa_embedded_list():
    """Embeds for search on general files."""
    return SubmittedFile.embedded_list


@collection(
    name="donor-specific-assemblies",
    unique_key="submitted_id",
    properties={
        "title": "Donor Specific Assembly",
        "description": "Files containing as donor-specific assembly",
    },
)
class DonorSpecificAssembly(SubmittedFile):
    item_type = "donor_specific_assembly"
    schema = load_schema("encoded:schemas/donor_specific_assembly.json")
    embedded_list = _build_dsa_embedded_list()
