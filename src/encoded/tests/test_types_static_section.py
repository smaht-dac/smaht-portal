from typing import Any, Dict, Union

import pytest
from webtest.app import TestApp

from .utils import get_item, patch_item, post_item


@pytest.fixture
def static_section(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "identifier": "some-static-section",
        "consortia": [test_consortium["uuid"]],
        "status": "public",
        "section_type": "Page Section",
    }
    return post_item(testapp, item, "StaticSection")


def test_identifier_resource_path(
    testapp: TestApp, static_section: Dict[str, Any]
):
    """Ensure 'identifier' is available resource path."""
    identifier = static_section.get("identifier", "")
    get_item(testapp, identifier, collection="StaticSection")


REMOTE_CONTENT_URL = "https://postman-echo.com/response-headers?foo1=bar1&foo2=bar2"
REMOTE_CONTENT = '{\n  "foo1": "bar1",\n  "foo2": "bar2"\n}'
LOCAL_FILE_PATH = "/docs/public/about_introduction.md"
LOCAL_FILE_CONTENTS = "# Hello\n\nI am a test markdown file"


@pytest.mark.parametrize(
    "patch_body,expected",
    [
        ({}, None),
        ({"body": "the body text"}, "the body text"),
        ({"file": REMOTE_CONTENT_URL}, REMOTE_CONTENT),
        ({"file": LOCAL_FILE_PATH}, LOCAL_FILE_CONTENTS),
    ]
)
def test_content(
    patch_body: Dict[str, Any],
    expected: Union[str, None],
    testapp: TestApp,
    static_section: Dict[str, Any],
) -> None:
    """Test 'content' calcprop retrieved from body, URL, or file.

    Note: Relying on postman URL above and local file for these tests.
    """
    response = patch_item(testapp, patch_body, static_section["uuid"])
    assert response.get("content") == expected


@pytest.mark.parametrize(
    "patch_body,expected",
    [
        ({}, None),
        ({"body": "the body text"}, "txt"),
        ({"body": "the body text", "options": {"filetype": "md"}}, "md"),
        ({"file": "/foo.bar"}, "bar"),
        ({"file": "https://something.com"}, "com"),
        ({"file": "/foo.bar", "options": {"filetype": "md"}}, "md"),
    ]
)
def test_filetype(
    patch_body: Dict[str, Any],
    expected: Union[str, None],
    testapp: TestApp,
    static_section: Dict[str, Any],
) -> None:
    """Test 'filetype' calcprop retrieved from body, URL, or file.

    Note: Relying on postman URL above and local file for these tests.
    """
    response = patch_item(testapp, patch_body, static_section["uuid"])
    assert response.get("filetype") == expected
