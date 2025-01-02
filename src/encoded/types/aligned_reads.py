from snovault import collection, load_schema

from .submitted_file import SubmittedFile


def _build_aligned_reads_embedded_list():
    """Embeds for search on aligned reads files."""
    return SubmittedFile.embedded_list + [
        "reference_genome.display_title",
    ]

@collection(
    name="aligned-reads",
    unique_key="submitted_id",
    properties={
        "title": "Aligned Reads",
        "description": "Files containing sequencing reads aligned to a reference genome",
    },
)
class AlignedReads(SubmittedFile):
    item_type = "aligned_reads"
    schema = load_schema("encoded:schemas/aligned_reads.json")
    embedded_list = _build_aligned_reads_embedded_list()
