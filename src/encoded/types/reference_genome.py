from snovault import collection, load_schema

from .base import Item
from ..schema_formats import is_accession

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

    def get(self, name, default=None):
        """Override method to allow submitted_id keys for reference genome.

        Allows DonorSpecificAssembly types to show up in search of RefrenceGenome collection.
        """
        resource = super(Item, self).get(name, None)
        if resource is not None:
            return resource
        if "DONOR-SPECIFIC-ASSEMBLY" in name:
            resource = self.connection.get_by_unique_key("submitted_id", name)
            if resource is not None:
                if not self._allow_contained(resource):
                    return default
                return resource
