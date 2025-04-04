from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .file import File


@collection(
    name="metadata-files",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "SMaHT Metadata Files",
        "description": "Listing of SMaHT Metadata Files",
    },
)
class MetadataFile(File):
    item_type = "metadata_file"
    schema = load_schema("encoded:schemas/metadata_file.json")
    embedded_list = []
