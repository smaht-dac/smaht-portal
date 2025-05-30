from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .file import File


@collection(
    name="resource-files",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "SMaHT Resource Files",
        "description": "Listing of SMaHT Resource Files",
    },
)
class ResourceFile(File):
    item_type = "resource_file"
    schema = load_schema("encoded:schemas/resource_file.json")
    embedded_list = []
