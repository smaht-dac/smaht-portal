from snovault import collection, load_schema

from .submitted_file import SubmittedFile


def _build_general_file_embedded_list():
    """Embeds for search on general files."""
    return SubmittedFile.embedded_list


@collection(
    name="general-files",
    unique_key="submitted_id",
    properties={
        "title": "General File",
        "description": "General submitted files",
    },
)
class GeneralFile(SubmittedFile):
    item_type = "general_file"
    schema = load_schema("encoded:schemas/general_file.json")
    embedded_list = _build_general_file_embedded_list()
