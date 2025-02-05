from snovault import collection, load_schema

from .submitted_file import SubmittedFile


def _build_supplementary_file_embedded_list():
    """Embeds for search on supplementary files."""
    return SubmittedFile.embedded_list + [
        "reference_genome.display_title",
        "donor_specific_assembly.donors",
        "donor_specific_assembly.cell_lines.code",
    ]


@collection(
    name="supplementary-files",
    unique_key="submitted_id",
    properties={
        "title": "Supplementary File",
        "description": "Supplementary submitted files",
    },
)
class SupplementaryFile(SubmittedFile):
    item_type = "supplementary_file"
    schema = load_schema("encoded:schemas/supplementary_file.json")
    embedded_list = _build_supplementary_file_embedded_list()
