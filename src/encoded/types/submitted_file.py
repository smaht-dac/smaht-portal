from snovault import abstract_collection, load_schema

from .acl import SUBMISSION_CENTER_MEMBER_CREATE_ACL
from .file import File
from .submitted_item import SubmittedItem


@abstract_collection(
    name="submitted-files",
    unique_key="submitted_id",
    acl=SUBMISSION_CENTER_MEMBER_CREATE_ACL,
    properties={
        "title": "SMaHT Submitted Files",
        "description": "Listing of SMaHT Submitted Files",
    })
class SubmittedFile(File, SubmittedItem):
    item_type = "submitted_file"
    base_types = ["SubmittedFile"] + File.base_types
    schema = load_schema("encoded:schemas/submitted_file.json")
    embedded_list = File.embedded_list
