from snovault import collection, load_schema

from .submitted_file import SubmittedFile


def _build_external_output_file_embedded_list():
    """Embeds for search on external output files."""
    return SubmittedFile.embedded_list + [
        "reference_genome.display_title",
    ]


@collection(
    name="external-output-files",
    unique_key="submitted_id",
    properties={
        "title": "External Output File",
        "description": "Submitted files that are the output of external analyses",
    },
)
class ExternalOutputFile(SubmittedFile):
    item_type = "external_output_file"
    schema = load_schema("encoded:schemas/external_output_file.json")
    embedded_list = _build_external_output_file_embedded_list()
