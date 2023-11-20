from base64 import b64decode
from typing import Any, Dict

import pytest
from snovault.tests.test_attachment import RED_DOT
from webtest.app import TestApp

from .utils import post_item


IMAGE_UUID = "7874ded8-9e34-4bf4-b22e-956d30957a61"


@pytest.fixture
def red_dot_image(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "uuid": IMAGE_UUID,
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "description": "Some image",
        "caption": "Caption for this image",
        "attachment": {
            "download": "red-dot.png",
            "href": RED_DOT,
        },
    }
    return post_item(testapp, item, "Image")



def test_attachment_update(red_dot_image: Dict[str, Any]) -> None:
    """Ensure Image attachment updated on POST."""
    attachment = red_dot_image.get("attachment", {})
    assert attachment['href'] == '@@download/attachment/red-dot.png'
    assert attachment['type'] == 'image/png'
    assert attachment['width'] == 5
    assert attachment['height'] == 5
    assert attachment['md5sum'] == 'b60ab2708daec7685f3d412a5e05191a'
    assert attachment["blob_id"]


def test_attachment_download(testapp: TestApp, red_dot_image: Dict[str, Any]) -> None:
    href = red_dot_image.get("attachment", {}).get("href", "")
    download_url = f"{red_dot_image.get('@id')}{href}"
    download_response = testapp.get(download_url, status=200)
    assert download_response.content_type == "image/png"
    assert download_response.body == b64decode(RED_DOT.split(',', 1)[1])
