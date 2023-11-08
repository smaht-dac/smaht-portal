from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import patch_item, post_item_and_return_location


@pytest.fixture
def static_section(testapp: TestApp, test_consortium: Dict[str, Any]) -> Dict[str, Any]:
    item = {
        "identifier": "some-static-section",
        "consortia": [test_consortium["uuid"]],
    }
    return post_item_and_return_location(testapp, item, "StaticSection")


@pytest.mark.parametrize(
    "identifier,expected_status",
    [
        ("should-work", 200),
        ("should_work", 200),
        ("should.work", 200),
        ("should.still.work", 200),
        ("should_work_123", 200),
        ("should/not_work", 422),
        ("should..not_work", 422),
    ],
)
def test_identifier_pattern(
    identifier: str,
    expected_status: int,
    testapp: TestApp,
    static_section: Dict[str, Any],
) -> None:
    patch_body = {"identifier": identifier}
    patch_item(testapp, patch_body, static_section["uuid"], status=expected_status)
