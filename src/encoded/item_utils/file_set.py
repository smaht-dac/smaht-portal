from functools import partial
from typing import Any, Dict, List, Optional, Union

from . import library as library_utils
from .utils import RequestHandler, get_property_values_from_identifiers


def get_sequencing(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get sequencing connected to file set."""
    return properties.get("sequencing", "")


def get_libraries(file_set: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get libraries connected to file set."""
    return file_set.get("libraries", [])


def get_samples(
    file_set: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[Dict[str, Any], str]]:
    """Get samples connected to file set.

    If samples not present as direct link, fetch samples from libraries,
    if possible.
    """
    result = []
    if samples := file_set.get("samples"):
        result = samples
    elif request_handler:
        result = get_property_values_from_identifiers(
            request_handler,
            get_libraries(file_set),
            partial(library_utils.get_samples, request_handler),
        )
    return result
