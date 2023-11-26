from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def software(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "aliases": ["foo:software-test"],
        "category": ["Alignment"],
        "name": "test_software",
        "title": "Test Software",
        "version": "4.3.2",
        "binary_url": "https://foo.bar",
        "commit": "abcde123",
        "source_url": "https://bar.foo",
    }
    return post_item(testapp, item, "Software")


def test_software_post(software: Dict[str, Any]) -> None:
    """Ensure Software properties POST."""
    pass
