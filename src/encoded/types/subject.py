from typing import List, Union

from pyramid.request import Request
from snovault import calculated_property, collection

from .base import SMAHTItem, load_smaht_schema


@collection(
    name="subjects",
    unique_key="accession",
    properties={"title": "Subjects", "description": "Listing of subjects"},
)
class Subject(SMAHTItem):
    item_type = "subject"
    schema = load_smaht_schema(item_type)
    rev = {"biosources": ("Biosource", "subject")}

    @calculated_property(
        schema={
            "title": "Biosources",
            "description": "Biosources from this individual",
            "type": "array",
            "items": {
                "title": "Biosource",
                "type": "string",
                "linkTo": "Biosource",
            },
        }
    )
    def biosources(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "biosources")
        if result:
            return result
