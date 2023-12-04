from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import get_item, post_item


@pytest.fixture
def submission_center_properties() -> Dict[str, Any]:
    return {
        "title": "Some submission center",
        "identifier": "foo_bar_center",
    }


def test_identifier_resource_path(
    testapp: TestApp,
    test_submission_center: Dict[str, Any],
) -> None:
    """Ensure 'identifier' is available resource path."""
    identifier = test_submission_center.get("identifier", "")
    get_item(testapp, identifier, collection="SubmissionCenter")


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    submission_center_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately.

    Note: 422 (Unprocessable) instead of 403 (Forbidden) because of
    'identifier' permissions and requirement.
    """
    post_item(anontestapp, submission_center_properties, "SubmissionCenter", status=422)
    post_item(
        unassociated_user_app,
        submission_center_properties,
        "SubmissionCenter",
        status=422,
    )
    post_item(
        submission_center_user_app,
        submission_center_properties,
        "SubmissionCenter",
        status=422,
    )
    post_item(
        consortium_user_app,
        submission_center_properties,
        "SubmissionCenter",
        status=422,
    )
    post_item(testapp, submission_center_properties, "SubmissionCenter", status=201)
