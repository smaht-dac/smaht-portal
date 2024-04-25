from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Union

from dcicutils import ff_utils
from pyramid.request import Request
from webtest import TestApp

from . import constants
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
            raise ValueError("Either request, auth key, or test app must be provided")

    def get_items(
        self,
        identifiers: List[Union[str, Dict[str, Any]]],
        collection: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get items from request or auth_key"""
        unique_identifiers = self._get_unique_identifiers(identifiers)
        if self.request:
            return [
                self._get_item_from_request(identifier, collection=collection)
                for identifier in unique_identifiers
            ]
        elif self.auth_key:
            return [
                self._get_item_from_auth_key(identifier)
                for identifier in unique_identifiers
            ]
        elif self.test_app:
            return [
                self._get_item_from_test_app(identifier, collection=collection)
                for identifier in unique_identifiers
            ]
        return []

    def _get_unique_identifiers(
        self, identifiers: List[Union[str, Dict[str, Any]]]
    ) -> List[str]:
        """Get unique identifiers.

        If identifiers are dictionaries (e.g. via embedded view),
        extract UUIDs.
        """
        identifiers = [self._get_identifier(identifier) for identifier in identifiers]
        return list(set(identifiers))

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
        return ff_utils.get_metadata(
            identifier, key=self.auth_key, add_on="frame=object"
        )

    def _get_item_from_test_app(
        self, identifier: str, collection: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get item from test app"""
        return get_item_with_testapp(self.test_app, identifier, collection=collection)


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


def get_study_from_external_id(external_id: str) -> str:
    """Get "study" (a.k.a. production or benchmarking) from external ID.

    NOTE: Impossible to determine study from external ID alone, but
    should suffice for IDs from TPC. Primary concern is TTD IDs can
    also match criteria and be incorrectly identified. If this becomes
    an issue, may need to check submission/sequencing centers and add
    metadata there appropriately.
    """
    if external_id.startswith(constants.PRODUCTION_PREFIX):
        return constants.PRODUCTION_STUDY
    if external_id.startswith(constants.BENCHMARKING_PREFIX):
        return constants.BENCHMARKING_STUDY
    return ""
