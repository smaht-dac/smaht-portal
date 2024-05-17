from typing import Optional, Union
from snovault import calculated_property, collection, load_schema
from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item

@collection(
    name="new-types",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "SMaHT New Types",
        "description": 'Listing of SMaHT New Types',
    },
)
class NewType(Item):
    item_type = "new_type"
    schema = load_schema("encoded:schemas/new_type.json")
    embedded_list=[
        # Consortie linkTo
        'consortia.identifier',

        # Submission Center linkTo
        'submission_centers.identifier',
    ]


# @calculated_property(schema={"title": "Title", "type": "string"})
# def title(self, foo_or_bar: Optional[str], if_bar: Optional[str]) -> Union[str, None]:
#     if for_or_bar and if_bar:
#         pass
# )

