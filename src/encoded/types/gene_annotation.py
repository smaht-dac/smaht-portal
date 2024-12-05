from snovault import collection, load_schema

from .base import Item

def _build_gene_annotation_embedded_list():
    """Embeds for search on gene annotations."""
    return []


@collection(
    name="gene-annotations",
    unique_key="gene_annotation:identifier",
    properties={
        "title": "Gene Annotations",
        "description": "Gene annotations for gene and transcript quantification",
    },
)
class GeneAnnotation(Item):
    item_type = "gene_annotation"
    schema = load_schema("encoded:schemas/gene_annotation.json")
    embedded_list = _build_gene_annotation_embedded_list()
