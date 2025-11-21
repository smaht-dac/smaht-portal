from typing import Any, Dict

from .item import get_types


def is_submitted_file(properties: Dict[str, Any]) -> bool:
    return "SubmittedFile" in get_types(properties)  
