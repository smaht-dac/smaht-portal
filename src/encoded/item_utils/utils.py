from dataclasses import dataclass
from functools import cached_property, lru_cache
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

from dcicutils import ff_utils
from pyramid.request import Request
from webtest import TestApp

from ..item_utils import item as item_utils
from ..utils import get_item as get_item_from_request, get_item_with_testapp


@dataclass(frozen=True)
class RequestHandler:
    """Retrieve items via internal or external requests.

    Returns items in "frame=object" format.
    """

    request: Optional[Request] = None
    auth_key: Optional[Dict[str, str]] = None
    test_app: Optional[TestApp] = None

    def __post_init__(self) -> None:
        if not self.request and not self.auth_key and not self.test_app:
            raise ValueError("Either request, auth_key, or test app must be provided")

    @cached_property
    def hashed_auth_key(self) -> Tuple[str, str]:
        if not self.auth_key:
            return tuple()
        return tuple(self.auth_key.items())

    def get_items(
        self,
        identifiers: List[Union[str, Dict[str, Any]]],
        collection: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get items from request or auth_key"""
        return [
            self.get_item(identifier, collection=collection)
            for identifier in identifiers
        ]

    def _get_identifier(self, identifier: Union[str, Dict[str, Any]]) -> str:
        """Get identifier from input.

        If identifier is a dictionary (e.g. from embedded view),
        extract UUID.
        """
        if isinstance(identifier, dict):
            return item_utils.get_uuid(identifier)
        return identifier

    def get_item(
        self, identifier: Union[str, Dict[str, Any]], collection: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get item from request or auth_key"""
        if not identifier:
            return {}
        identifier = self._get_identifier(identifier)
        if self.request:
            return self._get_item_from_request(identifier, collection=collection)
        if self.auth_key:
            return self._get_item_from_auth_key(identifier)
        if self.test_app:
            return self._get_item_from_test_app(identifier, collection=collection)
        return {}

    def _get_item_from_request(
        self, identifier: str, collection: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get item from request"""
        return get_item_from_request(self.request, identifier, collection=collection)

    def _get_item_from_auth_key(self, identifier: str) -> Dict[str, Any]:
        """Get item from auth_key"""
        return self._get_and_cache_item_from_auth_key(identifier, self.hashed_auth_key)

    @staticmethod
    @lru_cache(maxsize=128)
    def _get_and_cache_item_from_auth_key(
        identifier: str, auth_key: Tuple[str, str]
    ) -> Dict[str, Any]:
        """Get item from auth_key and cache result."""
        unhashed_auth_key = dict(auth_key)
        return ff_utils.get_metadata(
            identifier, key=unhashed_auth_key, add_on="frame=object"
        )

    def _get_item_from_test_app(
        self, identifier: str, collection: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get item from test app"""
        return get_item_with_testapp(
            self.test_app, identifier, collection=collection, frame="object"
        )


def get_unique_values(
    items: List[Dict[str, Any]], retriever: Callable, exclude_null: bool = True
) -> List[Any]:
    """Get unique values from items, as returned by the retriever."""
    values = unravel_lists([retriever(item) for item in items])
    unique_values = []
    for value in values:
        if value not in unique_values:
            unique_values.append(value)
    if exclude_null:
        return [value for value in unique_values if value]
    return unique_values


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
