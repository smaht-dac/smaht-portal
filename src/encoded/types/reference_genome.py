from snovault import collection, load_schema

from .base import Item

def _build_reference_genome_embedded_list():
    """Embeds for search on reference genomes."""
    return []


@collection(
    name="reference-genomes",
    unique_key="reference_genome:identifier",
    properties={
        "title": "Reference Genomes",
        "description": "Assembled genomes for sequencing alignment",
    },
)
class ReferenceGenome(Item):
    item_type = "reference_genome"
    schema = load_schema("encoded:schemas/reference_genome.json")
    embedded_list = _build_reference_genome_embedded_list()
