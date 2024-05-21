from typing import Optional, Union
from snovault import calculated_property, collection, load_schema
from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item
#from pyramid.request import Request

def _build_new_type_embedded_list():
    """Embeds for search on new types."""
    return [
        # Facets
        "submission_centers.display_title",
        "consortia.display_title",        
        # Consortia linkTo
        'consortia.identifier',

        # Submission Center linkTo
        'submission_centers.identifier'
    ]


@collection(
    name="new-types",
    unique_key="new_type:identifier",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "SMaHT New Types",
        "description": 'Listing of SMaHT New Types',
    },
)
class NewType(Item):
    item_type = "new_type"
    schema = load_schema("encoded:schemas/new_type.json")
    embedded_list = _build_new_type_embedded_list()
    # @calculated_property(schema={"title": "Foobar Value", "type": "string"})
    # def string_and_number(self, foo_or_bar: Optional[str], integer_4_to_50: Optional[int]) -> Union[str, None]:
    #     """return string of foo_or_bar and integer_4_to_50"""
    #     if foo_or_bar and integer_4_to_50:
    #         new_string=u'{} {}'.format(foo_or_bar, str(integer_4_to_50))
    #         return new_string
    # @calculated_property(
    #     schema={
    #         "title": "Tissue Sample",
    #         "type": "string",
    #         "linkTo": "TissueSample",
    #     },
    # )
    # def tissue_sample(self, request: Request):
    #     #result = self.
    #     pass
    
