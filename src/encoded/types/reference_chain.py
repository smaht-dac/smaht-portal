from snovault import collection, load_schema

from .submitted_file import SubmittedFile


def _build_reference_chain_embedded_list():
    """Embeds for search on reference chain."""
    return SubmittedFile.embedded_list


@collection(
    name="reference-chains",
    unique_key="submitted_id",
    properties={
        "title": "Reference Chain",
        "description": "Chain file linking two genome assemblies",
    },
)
class ReferenceChain(SubmittedFile):
    item_type = "reference_chain"
    schema = load_schema("encoded:schemas/reference_chain.json")
    embedded_list = _build_reference_chain_embedded_list()
