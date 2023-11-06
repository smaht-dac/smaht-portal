from snovault import abstract_collection, load_schema

from .base import Item as SMAHTItem
from .file import File


@abstract_collection(
    name="submitted-files",
    properties={
        "title": "SMaHT Submitted Files",
        "description": "Listing of SMaHT Submitted Files",
    })
class SubmittedFile(File):
    item_type = "submitted_file"
    base_types = ["SubmittedFile"] + File.base_types
    schema = load_schema("encoded:schemas/submitted_file.json")
    embedded_list = SMAHTItem.embedded_list
