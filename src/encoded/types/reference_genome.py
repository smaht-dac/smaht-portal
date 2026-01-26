from typing import Optional, Union
from snovault import(
    collection,
    load_schema,
    calculated_property,
    display_title_schema,
)
from pyramid.request import Request

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

    @calculated_property(schema=display_title_schema)
    def display_title(
        self,
        request: Request,
        preferred_name: Optional[str] = None,
        title: Optional[str] = None,
        name: Optional[str] = None,
        external_id: Optional[str] = None,
        identifier: Optional[str] = None,
        submitted_id: Optional[str] = None,
        accession: Optional[str] = None,
        uuid: Optional[str] = None,
    ) -> Union[str, None]:
        if preferred_name:
            return preferred_name
        return Item.display_title(self, request, title, name, external_id, identifier, submitted_id, accession, uuid)
