from typing import List, Union

from pyramid.request import Request
from snovault import calculated_property, collection, load_schema

from .submitted_item import SubmittedItem


def _build_file_set_embedded_list():
    """Embeds for search on file sets."""
    return [
        "libraries.assay",
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
    rev = {
        "files": ("File", "file_sets"),
    }

    @calculated_property(
        schema={
            "title": "Files",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "File",
            },
        },
    )
    def files(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "files")
        if result:
            return result
        return
