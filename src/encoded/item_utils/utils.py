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
        if self.request:
            return self._get_item_from_request(identifier, collection=collection)
        return self._get_item_from_auth_key(identifier)

    def _get_item_from_request(
        self, identifier: str, collection: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get item from request"""
        return get_item_from_request(
            self.request, identifier, collection=collection
        )

    def _get_item_from_auth_key(self, identifier: str) -> Dict[str, Any]:
        """Get item from auth_key"""
        return ff_utils.get_metadata(
            identifier, key=self.auth_key, add_on="frame=object"
        )


def get_unique_values(
    items: List[Dict[str, Any]], retriever: Callable
) -> List[str]:
    """Get unique identifiers from items, as returned by the retriever."""
    values = unravel_lists([retriever(item) for item in items])
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
