from snovault import collection

from .base import SMAHTItem, load_smaht_schema


@collection(
    name="subjects",
    unique_key="accession",
    properties={"title": "Subjects", "description": "Listing of subjects"},
)
class Subject(SMAHTItem):
    item_type = "subject"
    schema = load_smaht_schema(item_type)
