from snovault import abstract_collection, load_schema

from .base import SubmittedItem


@abstract_collection(
    name="subjects",
    properties={
        "title": "Subjects",
        "description": "Sources of biological material",
    })
class Subject(SubmittedItem):
    item_type = "subject"
    schema = load_schema("encoded:schemas/subject.json")
