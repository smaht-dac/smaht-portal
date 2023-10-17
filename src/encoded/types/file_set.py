from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name="",
    properties={
        "title": "",
        "description": "Listing of ",
    })
class A(SMAHTItem):
    item_type = ""
    schema = load_schema("encoded:schemas/.json")
