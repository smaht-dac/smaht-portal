from snovault import collection, load_schema

from .base import Item as SMAHTItem
from .file import File


@collection(
    name="output-files",
    properties={
        "title": "SMaHT Output Files",
        "description": "Listing of SMaHT Output Files",
    })
class OutputFile(File):
    item_type = "output_file"
    schema = load_schema("encoded:schemas/output_file.json")
    base_types = ["File"] + SMAHTItem.base_types
