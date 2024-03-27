from snovault import collection, load_schema

from .submitted_file import SubmittedFile


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
    embedded_list = SubmittedFile.embedded_list
