from snovault import collection, load_schema

from .preparation import Preparation


@collection(
    name="library-preparations",
    unique_key="submitted_id",
    properties={
        "title": "Library Preparations",
        "description": "Data on library preparation methods",
    },
)
class LibraryPreparation(Preparation):
    item_type = "library_preparation"
    schema = load_schema("encoded:schemas/library_preparation.json")
    embedded_list = []
