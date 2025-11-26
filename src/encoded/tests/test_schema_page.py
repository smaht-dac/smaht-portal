from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import patch_item, post_item_and_return_location


@pytest.fixture
def page(testapp: TestApp, test_consortium: Dict[str, Any]) -> Dict[str, Any]:
    item = {
        "identifier": "some-page",
        "consortia": [test_consortium["uuid"]],
        "status": "open",
        "table-of-contents": {
            "enabled": True,
            "header-depth": 3,
            "list-styles": ["lower-roman"],
        },
    }
    return post_item_and_return_location(testapp, item, "Page")


@pytest.mark.parametrize(
    "identifier,expected_status",
    [
        ("should-work", 200),
        ("should_work", 200),
        ("should/work", 200),
        ("Should/Work", 200),
        ("should-1/work-4", 200),
        ("should.not.work", 422),
        ("/should_not_work", 422),
        ("should_not_work/", 422),
        ("should//not_work", 422),
    ],
)
def test_identifier_pattern(
    identifier: str, expected_status: int, testapp: TestApp, page: Dict[str, Any]
) -> None:
    """Test 'identifier' regex for URL pattern."""
    patch_body = {"identifier": identifier}
    patch_item(testapp, patch_body, page["uuid"], status=expected_status)
