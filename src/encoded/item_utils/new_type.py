from typing import Any, Dict, Optional, Union

from . import tissue_sample as tissue_sample_utils
from .utils import RequestHandler, get_property_value_from_identifier


def get_tissue_samples(
        new_type: Dict[str, Any], request_handler: Optional[RequestHandler] = None
    ) -> List[str]:
    """Get tissue samples connected to new type."""
    return new_type.get("tissue_samples", [])



# def get_tissue_sample_category(new_type: Dict[str, Any], request_handler: Optional[RequestHandler] = None):
#     """Get category of tissue sample connected to new_type."""
#     if request_handler:
#         return get_property_value_from_identifier(
#             request_handler, get_tissue_samples(new_type), tissue_sample_utils.get_category
#         )
#     return ""