from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="file-sets",
    unique_key="file_set:submitted_id",
    properties={
        "title": "File Sets",
        "description": "Collections of related files",
    })
class FileSet(SMAHTItem):
    item_type = "file_set"
    schema = load_schema("encoded:schemas/file_set.json")
    embedded_list = []
