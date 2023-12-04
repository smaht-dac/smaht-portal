from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import get_item, post_item


@pytest.fixture
def user_properties() -> Dict[str, Any]:
    return {
        "email": "foo@bar.com",
        "first_name": "Foo",
        "last_name": "Bar",
    }


def test_email_resource_path(testapp: TestApp, admin: Dict[str, Any]) -> None:
    """Ensure 'email' is available resource path for User."""
    get_item(testapp, admin.get("email", ""), collection="User")


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    user_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately."""
    post_item(anontestapp, user_properties, "User", status=403)
    post_item(unassociated_user_app, user_properties, "User", status=403)
    post_item(submission_center_user_app, user_properties, "User", status=403)
    post_item(consortium_user_app, user_properties, "User", status=403)
    post_item(testapp, user_properties, "User", status=201)
