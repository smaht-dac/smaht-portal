from snovault import collection, load_schema, calculated_property

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import (
    Item,
)


@collection(
    name="publications",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "SMaHT Publications",
        "description": "Listing of SMaHT Publications",
    },
)
class Publication(Item):
    item_type = "publication"
    schema = load_schema("encoded:schemas/publication.json")
    embedded_list = []

    @calculated_property(schema={
        "title": "Short Citation",
        "description": "Short string containing <= 2 authors & year published.",
        "type": "string"
    })
    def short_citation(self, authors=None, date_published=None):
        minipub = ''
        if authors:
            minipub = authors[0]
            if len(authors) > 2:
                minipub = minipub + ' et al.'
            elif len(authors) == 2:
                minipub = minipub + ' and ' + authors[1]
        if date_published:
            minipub = minipub + ' (' + date_published[0:4] + ')'
        return minipub

    @calculated_property(schema={
        "title": "Number of Files in Publication",
        "description": "The number of files on the portal included in this publication.",
        "type": "integer"
    })
    def number_of_files(self, files_of_pub=None):
        ''' 
            How this will be calculated or if it will we depend on how we decide to implement and
            report on files associated with a publication.
        '''
        pass
