from typing import Any, Dict

from webtest.app import TestApp

from .utils import get_item


def test_identifier_resource_path(
    testapp: TestApp, file_formats: Dict[str, Dict[str, Any]]
) -> None:
    """Ensure 'identifier' is valid resource path."""
    assert file_formats
    file_format_identifiers = [
        file_format.get("identifier", "") for file_format in file_formats.values()
    ]
    some_identifier = file_format_identifiers[0]
    get_item(testapp, some_identifier, collection="FileFormat")
