from snovault import abstract_collection, load_schema

from .base import Item as SMAHTItem


@abstract_collection(
    name="Subjects",
    properties={
        "title": "Subjects",
        "description": "Sources of biological material",
    })
class Subject(SMAHTItem):
    item_type = "subject"
    schema = load_schema("encoded:schemas/subject.json")
