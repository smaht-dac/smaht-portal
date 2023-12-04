from typing import Any, Dict

from webtest.app import TestApp

from .utils import get_item


def test_identifier_resource_path(
    testapp: TestApp, higlass_view_config: Dict[str, Any]
) -> None:
    """Ensure 'identifier' is available resource path."""
    identifier = higlass_view_config.get("identifier", "")
    get_item(testapp, identifier, collection="HiglassViewConfig")
