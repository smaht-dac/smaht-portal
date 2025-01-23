from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .file import File


@collection(
    name="reference-files",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "SMaHT Reference Files",
        "description": "Listing of SMaHT Reference Files",
    },
)
class ReferenceFile(File):
    item_type = "reference_file"
    schema = load_schema("encoded:schemas/reference_file.json")
    embedded_list = ["reference_genome.display_title"]
