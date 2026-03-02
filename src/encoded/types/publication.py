from snovault import collection, load_schema, calculated_property

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import (
    Item,
)


@collection(
    name="publications",
    acl=ONLY_ADMIN_VIEW_ACL,
    unique_key="publication:identifier",
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
            minipub = authors[0]
            if len(authors) > 2:
                minipub = minipub + " et al."
            elif len(authors) == 2:
                minipub = minipub + " and " + authors[1]
        if date_published:
            minipub = minipub + " (" + date_published[0:4] + ")"
        return minipub
    
    
