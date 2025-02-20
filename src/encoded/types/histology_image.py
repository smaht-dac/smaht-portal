from snovault import collection, load_schema

from .submitted_file import SubmittedFile


@collection(
    name="histology-images",
    unique_key="submitted_id",
    properties={
        "title": "Histology Images",
        "description": "Histological image files of tissue samples",
    },
)
class HistologyImage(SubmittedFile):
    item_type = "histology_image"
    schema = load_schema("encoded:schemas/histology_image.json")
    embedded_list = []
