from typing import List, Dict, Optional, Union, Any
from snovault import calculated_property, collection, load_schema, display_title_schema
from .acl import ONLY_ADMIN_VIEW_ACL
from pyramid.request import Request

# from ..item_utils import (
#     new_type as new_type_utils,
# )
from .utils import get_item
from ..item_utils.utils import (
    RequestHandler,
)
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
        #"tissue_samples.submitted_id",
        #"tissue_samples.display_title"
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
        "donor": ("Donor", "has_new_type"),
    }

    @calculated_property(schema={"title": "Foobar Value", "type": "string"})
    def string_and_number(
        self, foo_or_bar: Optional[str], integer_4_to_50: Optional[int] = None
        ) -> str:
        """return string of foo_or_bar and integer_4_to_50"""
        if foo_or_bar and integer_4_to_50:
            new_string=u'{} {}'.format(foo_or_bar, str(integer_4_to_50))
            return new_string
        return foo_or_bar

    @calculated_property(
        schema={
            "title": "Submission Centers",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "SubmissionCenter"
            }
        }
    )
    def submission_centers_display_title(
        self, request: Request,submission_centers: List[str],
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
            "title": "Donor",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "Tissue",
            },
        },
    )
    def donor(self, request: Request) -> Union[str, None]:
        result = self.rev_link_atids(request, "donor")
        if result:
            return result
        return
    
    # @calculated_property(schema={
    #     "title": "Tissue Samples",
    #     "type": "array",
    #     "description": "Tissue Samples associated with the new type",
    #     "items": {
    #         "type": "string",
    #         "linkTo": "TissueSample",
    #     },
    # })
    # def tissue_samples_display_title(
    #     self, request: Request, tissue_samples: Optional[List[str]] = None
    # ) -> Union[List[str], None]:
    #     """Get Tissue Samples associated with the new type."""
    #     result = None
    #     if tissue_samples:
    #         tissue_sample_items = [
    #             get_item(request, tissue_sample, collection="TissueSample")
    #             for tissue_sample in tissue_samples
    #         ]
    #         tissue_sample_display_titles = [
    #             tissue_sample.get("display_title") for tissue_sample in tissue_sample_items
    #             if tissue_sample.get("display_title")
    #         ]
    #         if tissue_sample_display_titles:
    #             result = sorted(list(tissue_sample_display_titles))
    #     return result



