from typing import List, Dict, Optional, Union, Any
from snovault import calculated_property, collection, load_schema, display_title_schema
from .acl import ONLY_ADMIN_VIEW_ACL
from pyramid.request import Request

from ..item_utils import (
    new_type as new_type_utils,
    item as item_utils,
)
from ..item_utils.utils import (
    RequestHandler,
    get_property_values_from_identifiers,
)
from .submission_center import SubmissionCenter
from .base import Item

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

        # Tissue Sample linkTo
        "tissue_samples.submitted_id",
        "tissue_samples.display_title"
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

    # @calculated_property(
    #     schema={
    #         "title": "Submission Centers",
    #         "type": "array",
    #         "items": {
    #             "type": "string",
    #             "linkTo": "SubmissionCenter"
    #         }
    #     }
    # )
    # def submission_centers(
    #     self, request_handler: RequestHandler,new_type_properties: Dict[str, Any], uuid: str,
    #     ) -> Union[List[str],None]:
    #     """Submission Centers for the new type."""
    #     #result = self.get("submission_centers.display_title",[])
    #     result=get_property_values_from_identifiers(
    #             request_handler,
    #             item_utils.get_submission_centers(new_type_properties),
    #             item_utils.get_display_title,
    #         )
    #     return result

    @calculated_property(schema={"title": "Foobar Value", "type": "string"})
    def string_and_number(
        self, foo_or_bar: Optional[str], integer_4_to_50: Optional[int] = None
        ) -> Union[str, int, None]:
        """return string of foo_or_bar and integer_4_to_50"""
        if foo_or_bar and integer_4_to_50:
            new_string=u'{} {}'.format(foo_or_bar, str(integer_4_to_50))
            return new_string
        return foo_or_bar
    
    @calculated_property(schema={
        "title": "Tissue Samples",
        "type": "array",
        "description": "Tissue Samples associated with the new type",
        "items": {
            "type": "string",
            "linkTo": "TissueSample",
        },
    })
    def tissue_samples_display_title(
        self, request: Request, tissue_samples: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Tissue Samples associated with the new type."""
        return self._get_tissue_samples(request,tissue_samples=tissue_samples)
    

    def _get_tissue_samples(
            self, request: Request,tissue_samples: Optional[List[str]] = None,
        ) -> List[str]:
        """Get the  tissue samples associated with the new type."""
        if tissue_samples:
            request_handler = RequestHandler(request=request)
            result=new_type_utils.get_tissue_samples(self.properties, request_handler)
            #item_utils.get_display_title,
        return result or None
    
    # @calculated_property(
    #     schema={}
    # )
    # def donor(self, request: Request):
    #     pass


