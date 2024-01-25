from typing import Any, Dict, Optional, List, Union

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
