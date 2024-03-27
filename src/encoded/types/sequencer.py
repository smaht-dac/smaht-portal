from typing import Optional, Union

from pyramid.request import Request
from snovault import calculated_property, collection, load_schema

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

    @calculated_property(schema={"title": "Display Title", "type": "string"})
    def display_title(
        self,
        request: Request,
        platform: Optional[str] = None,
        model: Optional[str] = None,
        identifier: Optional[str] = None,
        accession: Optional[str] = None,
    ) -> Union[str, None]:
        if platform and model:
            return f"{platform} {model}"
        if identifier:
            return identifier
        if accession:
            return accession
