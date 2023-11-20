from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def image(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "description": "Some image",
        "caption": "Caption for this image",
    }
    return post_item(testapp, item, "Image")


def test_image_post(image: Dict[str, Any]) -> None:
    """Ensure Image properties POST."""
    pass
