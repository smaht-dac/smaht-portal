from snovault import collection, load_schema

from .submitted_file import SubmittedFile


@collection(
    name="variant-calls",
    unique_key="submitted_id",
    properties={
        "title": "Variant Calls",
        "description": "Files containing variant calls",
    })
class VariantCalls(SubmittedFile):
    item_type = "variant_calls"
    schema = load_schema("encoded:schemas/variant_calls.json")
    embedded_list = []
