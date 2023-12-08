from base64 import b64decode, b64encode
from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


DOCUMENT_UUID = "fcbaa213-2868-4b94-af17-07076c6507bc"
TEXT_BODY = b"I'm the text body"
TEXT = f"data:text/plain;base64,{b64encode(TEXT_BODY)}"


@pytest.fixture
def text_document(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "uuid": DOCUMENT_UUID,
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "attachment": {
            "download": "simple_text.txt",
            "href": TEXT,
        },
    }
    return post_item(testapp, item, "Document")



def test_attachment_update(text_document: Dict[str, Any]) -> None:
    """Ensure Image attachment updated on POST."""
    attachment = text_document.get("attachment", {})
    assert attachment["href"] == "@@download/attachment/simple_text.txt"
    assert attachment["type"] == "text/plain"
    assert attachment["md5sum"] == "67956a0c0e0db0c1d7df4c3227debcf8"
    assert attachment["blob_id"]


def test_attachment_download(testapp: TestApp, text_document: Dict[str, Any]) -> None:
    href = text_document.get("attachment", {}).get("href", "")
    download_url = f"{text_document.get('@id')}{href}"
    download_response = testapp.get(download_url, status=200)
    assert download_response.content_type == "text/plain"
    assert download_response.body == b64decode(TEXT.split(',', 1)[1])
