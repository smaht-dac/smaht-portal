from typing import Any, Dict

from webtest.app import TestApp

from .utils import get_item


def test_identifier_resource_path(
    testapp: TestApp, test_consortium: Dict[str, Any]
):
    """Ensure 'identifier' is available resource path."""
    identifier = test_consortium.get("identifier", "")
    get_item(testapp, identifier, collection="Consortium")
