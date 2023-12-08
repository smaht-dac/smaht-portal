from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def document(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "description": "Some document",
    }
    return post_item(testapp, item, "Document")


def test_document_post(document: Dict[str, Any]) -> None:
    """Ensure Document properties POST."""
    pass
