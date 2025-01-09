from typing import Any, Dict, Union, List

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


def  get_property_for_validation(
    validate_property: str, existing_properties: Dict[str, Any], update_properties: Dict[str, Any]
) -> List[str]:
    """Get property for validation.
    
    If property is being updated, use the updated value.
    Otherwise, use the existing value. Currently does not handle default null values.
    """
    return update_properties.get(validate_property) or existing_properties.get(validate_property)


exported(get_item)
