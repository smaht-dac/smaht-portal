from snovault import collection, load_schema

from .base import Item as SmahtItem


@collection(
    name="reference-genomes",
    unique_key="reference_genome:identifier",
    properties={
        "title": "Reference Genomes",
        "description": "Assembled genomes for sequencing alignment",
    },
)
class ReferenceGenome(SmahtItem):
    item_type = "reference_genome"
    schema = load_schema("encoded:schemas/reference_genome.json")
    embedded_list = []
