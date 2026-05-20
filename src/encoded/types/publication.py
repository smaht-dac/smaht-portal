from snovault import collection, load_schema, calculated_property

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import (
    Item,
)


@collection(
    name="publications",
    acl=ONLY_ADMIN_VIEW_ACL,
    unique_key="publication:accession",
    properties={
        "title": "SMaHT Publications",
        "description": "Listing of SMaHT Publications",
    },
)
class Publication(Item):
    item_type = "publication"
    schema = load_schema("encoded:schemas/publication.json")
    embedded_list = []

    """Place holder for citation calc prop.
        NOTE: may turn into a property if it can be pulled from an external source
    """
    @calculated_property(
    schema={
            "title": "Citation",
            "description": "Citation that can be used to cite this paper.",
            "type": "string",
        }
    )
    def citation(self,):
        return


    @calculated_property(
        schema={
            "title": "Short Citation",
            "description": "Short string containing <= 2 authors & year published.",
            "type": "string",
        }
    )
    def short_citation(self, authors=None, date_published=None):
        minipub = ""
        if authors:
            first_author = authors[0]
            fa_last = first_author.get("last_name", "")
            if len(authors) == 1:
                minipub = fa_last
            elif len(authors) > 2:
                minipub = fa_last + " et al."
            elif len(authors) == 2:
                minipub = fa_last + " and " + authors[1].get("last_name", "")
        if date_published:
            minipub = minipub + " (" + date_published[0:4] + ")"
        return minipub
    
    
