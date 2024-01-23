from typing import Optional

from pyramid.request import Request
from snovault import calculated_property, collection, display_title_schema, load_schema

from .base import Item


@collection(
    name="sequencers",
    unique_key="sequencer:identifier",
    properties={
        "title": "Sequencer",
        "description": "Sequencing machine used for data generation",
    },
)
class Sequencer(Item):
    item_type = "sequencer"
    schema = load_schema("encoded:schemas/sequencer.json")
    embedded_list = []

    @calculated_property(schema=display_title_schema)
    def display_title(
        self,
        request: Request,
        platform: Optional[str] = None,
        model: Optional[str] = None,
        identifier: Optional[str] = None,
        accession: Optional[str] = None,
    ) -> str:
        if platform and model:
            return f"{platform} {model}"
        if identifier:
            return identifier
        if accession:
            return accession
