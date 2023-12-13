from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import patch_item, post_item


@pytest.fixture
def software(
    testapp: TestApp, test_submission_center: Dict[str, Any]
) -> Dict[str, Any]:
    item = {
        "aliases": ["test:software"],
        "category": ["Alignment"],
        "version": "1.0.0",
        "title": "test software",
        "name": "test_software",
        "submission_centers": [test_submission_center["uuid"]],
    }
    return post_item(testapp, item, "Software")


@pytest.mark.parametrize(
    "version,expected_status",
    [
        ("", 422),
        ("w", 200),
        ("1.0.0", 200),
        ("1.0.0-alpha", 200),
        ("v2.2.2", 200),
        ("abcdefg", 200),
    ],
)
def test_version_pattern(
    version: str,
    expected_status: int,
    testapp: TestApp,
    software: Dict[str, Any],
) -> None:
    """Test that the version field is validated by the pattern regex."""
    patch_body = {"version": version}
    patch_item(testapp, patch_body, software["uuid"], status=expected_status)
