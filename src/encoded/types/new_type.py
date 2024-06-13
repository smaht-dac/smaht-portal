from typing import List, Dict, Optional, Union, Any
from snovault import (
    calculated_property,
    collection,
    load_schema,
)
from snovault.util import debug_log

from .acl import ONLY_ADMIN_VIEW_ACL
from pyramid.request import Request
from pyramid.view import view_config

from .utils import get_item
from .base import (
    Item,
    item_edit,
    collection_add,
)

def _build_new_type_embedded_list() -> List[str]:
    """Embeds for search on new types."""
    return [
        # Facets
        "submission_centers.display_title",
        "consortia.display_title",        
        # Consortia linkTo
        "consortia.identifier",

        # Submission Center linkTo
        "submission_centers.identifier",
        
        # # User linkTo
        "associated_file_set.submitted_id",
        "associated_file_set.file_group.*",
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

    rev = {
        "unaligned_reads": ("UnalignedReads", "has_new_type"),
    }

    @calculated_property(
        schema={
            "title": "Foobar Value",
            "type": "string"
        }
    )
    def string_and_number(
        self,
        foo_or_bar: Optional[str] = None,
        integer_4_to_50: Optional[int] = None
        ) -> Union[str, None]:
        """return string of foo_or_bar and integer_4_to_50"""
        if foo_or_bar and integer_4_to_50:
            new_string=u'{} {}'.format(foo_or_bar, str(integer_4_to_50))
            return new_string
        return

    @calculated_property(
        schema={
            "title": "Submission Centers",
            "type": "array",
            "items": {
                "type": "string"
            }
        }
    )
    def submission_centers_display_title(
        self, request: Request,
        submission_centers: List[str] = None,
        ) -> Union[List[str],None]:
        """Submission Centers for the new type."""
        #result = self.get("submission_centers.display_title",[])
        result = None
        if submission_centers:
            submission_center_items = [
                get_item(request, submission_center, collection="SubmissionCenter")
                for submission_center in submission_centers
            ]
            submission_center_display_titles = [
                submission_center_item.get("display_title") for submission_center_item in submission_center_items
                if submission_center_item.get("display_title")
            ]
            if submission_center_display_titles:
                result = sorted(list(submission_center_display_titles))
        return result

    @calculated_property(
        schema={
            "title": "Unaligned Reads",
            "type": "string",
            "linkTo": "NewType",
        },
    )
    def unaligned_reads(
        self,
        request: Request
        ) -> Union[str, None]:
        result = self.rev_link_atids(request, "unaligned_reads")
        if result:
            return result
        return
    

def validate_integer_less_than_twenty(
        context: NewType,
        request: Request) -> None:
    """Check that fails a POST and a PATCH if the integer
      property between -4 and 50 is less than 20"""
    import pdb; pdb.set_trace()
    # Skip validator if property is empty
    if context.type_info.item_type != "new_type":
        return
    data = request.json
    if 'integer_4_to_50' not in data:
        return
    integer = data["integer_4_to_50"]
    threshold = 20
    new_type_ok = True
    if context.properties.get("integer_4_to_50","") == integer:
        return
    if integer < threshold:
        new_type_ok = False
    if new_type_ok:
        request.validated.update({})
    else:
        msg = f'Property value {str(integer)} for integer_4_to_50 must be greater than or equal to {str(threshold)}'
        request.errors.add('body','New Type: Invalid property value',msg)


NEW_TYPE_ADD_VALIDATORS = [
    validate_integer_less_than_twenty,
]

NEW_TYPE_EDIT_PATCH_VALIDATORS = [
    validate_integer_less_than_twenty,
]
    
@view_config(
    context=NewType,
    permission='add',
    request_method='POST',
    validators=NEW_TYPE_ADD_VALIDATORS,
)
@debug_log
def new_type_add(
    context: NewType, request: Request, render: Optional[bool] = None
) -> Dict[str, Any]:
    return collection_add(context, request, render)

@view_config(
    context=NewType,
    permission='edit',
    request_method='PATCH',
    validators=NEW_TYPE_EDIT_PATCH_VALIDATORS,
)
@debug_log
def new_type_edit(context: NewType, request: Request, render=None) -> Dict[str,Any]:
    return item_edit(context, request, render)