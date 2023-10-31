from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item_and_return_location


@pytest.fixture
def user(testapp: TestApp) -> Dict[str, Any]:
    item = {
        "email": "abcd@123.com",
        "first_name": "FooBar",
        "last_name": "Maximus",
    }
    return post_item_and_return_location(testapp, item, "User")


def test_email_unique(testapp: TestApp, user: Dict[str, Any]) -> None:
    item_with_duplicate_email = {
        "email": user.get("email"),
        "first_name": "Bob",
        "last_name": "Jones",
    }
    testapp.post_json("/User", item_with_duplicate_email, status=409)
