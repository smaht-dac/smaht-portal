from snovault import collection, load_schema

from .submitted_file import SubmittedFile


def _build_reference_sequence_embedded_list():
    """Embeds for search on reference sequence."""
    return SubmittedFile.embedded_list


@collection(
    name="reference-sequences",
    unique_key="submitted_id",
    properties={
        "title": "Reference Sequence",
        "description": "Files containing a reference genome sequence",
    },
)
class ReferenceSequence(SubmittedFile):
    item_type = "reference_sequence"
    schema = load_schema("encoded:schemas/reference_sequence.json")
    embedded_list = _build_reference_sequence_embedded_list()
