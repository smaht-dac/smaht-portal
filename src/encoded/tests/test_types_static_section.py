from typing import Any, Dict, Union
from unittest import mock

import pytest
from webtest.app import TestApp

from ..types import static_section as static_section_module
from .utils import patch_item, post_item


@pytest.fixture
def static_section(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "identifier": "some-static-section",
        "consortia": [test_consortium["uuid"]],
        "status": "open",
        "section_type": "Page Section",
    }
    return post_item(testapp, item, "StaticSection")


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

    Note: Depends on local file for these tests, while remote content
    mocked.
    """
    with mock.patch.object(
        static_section_module, "get_remote_file_contents", return_value=REMOTE_CONTENT
    ):
        response = patch_item(testapp, patch_body, static_section["uuid"], status=200)
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
