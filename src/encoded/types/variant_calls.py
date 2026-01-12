from snovault import collection, load_schema

from .submitted_file import SubmittedFile

def _build_variant_calls_embedded_list():
    """Embeds for search on variant calls files."""
    return SubmittedFile.embedded_list + [
        "reference_genome.display_title",
    ]

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
    embedded_list = _build_variant_calls_embedded_list()
