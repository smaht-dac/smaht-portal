from typing import Any, Dict, Union

import pytest
from webtest.app import TestApp

from .utils import patch_item, post_item


@pytest.fixture
def static_section(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "identifier": "some-static-section",
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "status": "open",
        "section_type": "Page Section",
        "options": {
            "filetype": "md",
            "collapsible": True,
        },
    }
    return post_item(testapp, item, "StaticSection")


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
    """Test 'identifier' regex."""
    patch_body = {"identifier": identifier}
    patch_item(testapp, patch_body, static_section["uuid"], status=expected_status)


@pytest.mark.parametrize(
    "body,file,expected_status",
    [
        (None, None, 200),
        ("the body text", None, 200),
        (None, "the_file.name", 200),
        ("the body text", "the_file.name", 422),
    ]
)
def test_body_or_file_validation(
    body: Union[str, None],
    file: Union[str, None],
    expected_status: int,
    testapp: TestApp,
    static_section: Dict[str, Any],
) -> None:
    """Ensure 'body' and 'file' not both present."""
    patch_body = {}
    if body:
        patch_body["body"] = body
    if file:
        patch_body["file"] = file
    patch_item(testapp, patch_body, static_section["uuid"], status=expected_status)
