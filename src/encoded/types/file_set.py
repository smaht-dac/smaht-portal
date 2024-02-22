from snovault import collection, load_schema

from .submitted_item import SubmittedItem


def _build_file_set_embedded_list():
    """Embeds for search on file sets."""
    return [
        "sequencing.sequencer.display_title",
    ]


@collection(
    name="file-sets",
    unique_key="submitted_id",
    properties={
        "title": "File Sets",
        "description": "Collections of related files",
    })
class FileSet(SubmittedItem):
    item_type = "file_set"
    schema = load_schema("encoded:schemas/file_set.json")
    embedded_list = _build_file_set_embedded_list()
