from snovault import collection, load_schema

from .submitted_item import SubmittedItem


def _build_library_embedded_list():
    """Embeds for search on libraries."""
    return [
        "assay",
    ]


@collection(
    name="libraries",
    unique_key="submitted_id",
    properties={
        "title": "Libraries",
        "description": "Sequencing libraries",
    },
)
class Library(SubmittedItem):
    item_type = "library"
    schema = load_schema("encoded:schemas/library.json")
    embedded_list = _build_library_embedded_list()
