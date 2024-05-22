from typing import Any, Dict, Optional, List

from .utils import RequestHandler


def get_tissue_samples(
        new_type: Dict[str, Any], request_handler: Optional[RequestHandler] = None
    ) -> List[str]:
    """Get tissue samples connected to new type."""
    return new_type.get("tissue_samples", [])


# def get_tissue_sample(
#         properties: Dict[str, Any]
#     ) -> str:
#     """Get tissue sample from properties."""
#     return properties.get("tissue_sample", [])



# def get_tissue_sample_category(new_type: Dict[str, Any], request_handler: Optional[RequestHandler] = None):
#     """Get category of tissue sample connected to new_type."""
#     if request_handler:
#         return get_property_value_from_identifier(
#             request_handler, get_tissue_samples(new_type), tissue_sample_utils.get_category
#         )
#     return ""