from typing import Any, Dict, List

from . import tissue
from .utils import RequestHandler


def get_tissues(
    request_handler: RequestHandler, properties: Dict[str, Any]
) -> List[str]:
    """Get tissues associated with sample."""
    sample_sources = get_sample_sources(properties)
    return [
        sample_source for sample_source in sample_sources
        if tissue.is_tissue(request_handler.get_item(sample_source))
    ]


def get_sample_sources(properties: Dict[str, Any]) -> List[str]:
    """Get sample sources associated with sample."""
    return properties.get("sample_sources", [])
