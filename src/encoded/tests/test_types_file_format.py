from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import get_item, post_item


@pytest.fixture
def file_format_properties(test_submission_center: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "identifier": "foo_bar_format",
        "standard_file_extension": "foo.bar",
        "submission_centers": [test_submission_center["uuid"]],
    }


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


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    file_format_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately.

    Note: 422 (Unprocessable) instead of 403 (Forbidden) because of
    'identifier' permissions and requirement.
    """
    post_item(anontestapp, file_format_properties, "FileFormat", status=422)
    post_item(unassociated_user_app, file_format_properties, "FileFormat", status=422)
    post_item(submission_center_user_app, file_format_properties, "FileFormat", status=422)
    post_item(consortium_user_app, file_format_properties, "FileFormat", status=422)
    post_item(testapp, file_format_properties, "FileFormat", status=201)
