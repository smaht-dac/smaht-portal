from typing import Any, Dict
from . import item as item_utils


def is_reference_genome(properties: Dict[str, Any]) -> bool:
    """Check if item is a DonorSpecificAssembly."""
    return item_utils.get_type(properties) == "ReferenceGenome"