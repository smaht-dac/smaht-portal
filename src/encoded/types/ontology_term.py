from typing import List, Optional, Union
from snovault import (
    collection,
    load_schema,
    calculated_property,
    display_title_schema,
)

from pyramid.request import Request
from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


@collection(
    name="ontology-terms",
    unique_key="ontology_term:identifier",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "Ontology Terms",
        "description": "Restricted vocabulary terms for an ontology",
    },
)
class OntologyTerm(Item):
    item_type = "ontology_term"
    schema = load_schema("encoded:schemas/ontology_term.json")
    embedded_list = []

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
