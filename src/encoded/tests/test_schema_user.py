from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def user(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "email": "abcd@123.com",
        "preferred_email": "1234@abc.com",
        "first_name": "FooBar",
        "last_name": "Maximus",
        "groups": ["admin"],
        "time_zone": "Africa/Abidjan",
        "status": "revoked",
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "aliases": ["foo:user-bar"],
    }
    return post_item(testapp, item, "User")


def test_user_post(testapp: TestApp, user: Dict[str, Any]) -> None:
    """Ensure all User properties POST."""
    pass


def test_email_unique(testapp: TestApp, user: Dict[str, Any]) -> None:
    """Ensure email is unique across users."""
    item_with_duplicate_email = {
        "email": user.get("email"),
        "first_name": "Bob",
        "last_name": "Jones",
    }
    post_item(testapp, item_with_duplicate_email, "User", status=409)
