from snovault import abstract_collection, load_schema

from .base import Item as SmahtItem


@abstract_collection(
    name="subjects",
    properties={
        "title": "Subjects",
        "description": "Sources of biological material",
    })
class Subject(SmahtItem):
    item_type = "subject"
    schema = load_schema("encoded:schemas/subject.json")
