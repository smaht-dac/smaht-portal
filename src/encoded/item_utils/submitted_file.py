from typing import Any, Dict

from .item import get_type


def is_submitted_file(properties: Dict[str, Any]) -> bool:
    return get_type(properties) == "SubmittedFile"
