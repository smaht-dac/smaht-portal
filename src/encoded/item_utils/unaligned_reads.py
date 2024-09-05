from typing import Any, Dict, List, Union

from ..utils import get_item
from ..item_utils import item as item_utils


def get_read_pair_number(properties: Dict[str, Any]) -> str:
    """Get read_pair_number from properties."""
    return properties.get("read_pair_number","")


def get_paired_with(properties: Dict[str, Any]) -> str:
    """Get paired_with from properties."""
    return properties.get("paired_with","")


def get_file_sets_display_titles(request, file_sets: Union[List[str],List[Dict[str, Any]]]):
    """Get file_sets diplay titles from file_sets."""
    if type(file_sets[0]) is str:
        return [
            item_utils.get_display_title(
                get_item(request, file_set, 'FileSet')
            ) for file_set in file_sets
        ]
    elif type(file_sets[0]) is dict:
        return [
            item_utils.get_display_title(file_set) for file_set in file_sets
        ]
    else:
        return []