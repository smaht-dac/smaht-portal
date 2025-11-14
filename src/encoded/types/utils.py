from typing import Any, Dict, Union, Optional

from dcicutils.misc_utils import exported
from pyramid.request import Request
from snovault import Item

from ..utils import get_item


def get_properties(properties_container: Union[Request, Item]) -> Dict[str, Any]:
    """Get item properties from given object."""
    if isinstance(properties_container, Request):
        return properties_container.json or {}
    if isinstance(properties_container, Item):
        return properties_container.properties or {}
    raise NotImplementedError(
        f"Unable to get properties from {properties_container.__class__.__name__}"
    )


def get_property_for_validation(
    key: str,
    existing: Dict[str, Any],
    update: Dict[str, Any],
) -> Optional[Any]:
    """Return the value of the given property key for validation purposes
    from the update data if present, otherwise use the existing or None by default
    """
    if key in update:
        return update[key]
    return existing.get(key)


exported(get_item)
