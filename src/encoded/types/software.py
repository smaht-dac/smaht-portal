from typing import Any, Dict, Optional, List

from encoded_core.types.software import Software as CoreSoftware
from pyramid.request import Request
from snovault import (
    collection,
    calculated_property,
    display_title_schema,
    load_schema,
    Item as SnovaultItem,
)

from .base import Item


@collection(
    name="software",
    unique_key="submitted_id",
    properties={
        "title": "Software",
        "description": "Listing of software for analyses",
    },
)
class Software(Item, CoreSoftware):
    item_type = "software"
    schema = load_schema("encoded:schemas/software.json")
    embedded_list = []

    def _update(
        self, properties: Dict[str, Any], sheets: Optional[List] = None
    ) -> None:
        return SnovaultItem._update(self, properties, sheets)

    @calculated_property(schema=display_title_schema)
    def display_title(
        self,
        request: Request,
        code: Optional[str] = None,
        title: Optional[str] = None,
        name: Optional[str] = None,
        submitted_id: Optional[str] = None,
        accession: Optional[str] = None,
    ) -> str:
        if code:
            return code
        if title:
            return title
        if name:
            return name
        if submitted_id:
            return submitted_id
        if accession:
            return accession
