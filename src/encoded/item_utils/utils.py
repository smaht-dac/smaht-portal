from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from dcicutils import ff_utils
from pyramid.request import Request

from ..utils import get_item as get_item_from_request


@dataclass(frozen=True)
class RequestHandler:
    """Retrieve items via internal or external requests.

    Returns items in "frame=object" format.
    """

    request: Optional[Request] = None
    auth_key: Optional[Dict[str, str]] = None

    def __post_init__(self) -> None:
        if not self.request and not self.auth_key:
            raise ValueError("Either request or auth_key must be provided")

    def get_items(
        self, identifiers: List[str], collection: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get items from request or auth_key"""
        unique_identifiers = list(set(identifiers))
        if self.request:
            return [
                self._get_item_from_request(identifier, collection=collection)
                for identifier in unique_identifiers
            ]
        return [
            self._get_item_from_auth_key(identifier)
            for identifier in unique_identifiers
        ]

    def get_item(
        self, identifier: str, collection: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get item from request or auth_key"""
        if not identifier:
            return {}
        if self.request:
            return self._get_item_from_request(identifier, collection=collection)
        return self._get_item_from_auth_key(identifier)

    def _get_item_from_request(
        self, identifier: str, collection: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get item from request"""
        return get_item_from_request(self.request, identifier, collection=collection)

    def _get_item_from_auth_key(self, identifier: str) -> Dict[str, Any]:
        """Get item from auth_key"""
        return ff_utils.get_metadata(
            identifier, key=self.auth_key, add_on="frame=object"
        )


def get_unique_values(
    items: List[Dict[str, Any]], retriever: Callable, exclude_null: bool = True
) -> List[Any]:
    """Get unique values from items, as returned by the retriever.

    Note: Retrieved values must be hashable as implemented.
    """
    values = unravel_lists([retriever(item) for item in items])
    if exclude_null:
        return list(set([value for value in values if value]))
    return list(set(values))


def unravel_lists(values: List[Any]) -> List[Any]:
    """Unravel lists within lists, if they exist."""
    result = []
    for value in values:
        if isinstance(value, list):
            result.extend(value)
        else:
            result.append(value)
    return result


def get_property_values_from_identifiers(
    request_handler: RequestHandler, identifiers: List[str], retriever: Callable
) -> List[Any]:
    """Get unique property values from items for given identifiers."""
    items = request_handler.get_items(identifiers)
    return get_property_values(items, retriever)


def get_property_values(items: List[Dict[str, Any]], retriever: Callable) -> List[Any]:
    """Get unique property values from items."""
    return get_unique_values(items, retriever)


def get_property_value_from_identifier(
    request_handler: RequestHandler, identifier: str, retriever: Callable
) -> Any:
    """Get property value from item for given identifier."""
    item = request_handler.get_item(identifier)
    return retriever(item)