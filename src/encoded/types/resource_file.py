from snovault import collection, load_schema

from .file import File


@collection(
    name="resource-files",
    properties={
        "title": "SMaHT Resource Files",
        "description": "Listing of SMaHT Resource Files",
    },
)
class ResourceFile(File):
    item_type = "resource_file"
    schema = load_schema("encoded:schemas/resource_file.json")
    embedded_list = []
