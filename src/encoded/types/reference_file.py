from snovault import collection, load_schema

from .base import Item as SMAHTItem
from .file import File


@collection(
    name="reference-files",
    properties={
        "title": "SMaHT Reference Files",
        "description": "Listing of SMaHT Reference Files",
    },
)
class ReferenceFile(File):
    item_type = "reference_file"
    schema = load_schema("encoded:schemas/reference_file.json")
    embedded_list = []
