from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def filter_set(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "title": "My lovely filter set",
        "aliases": ["foo:filter_set-bar"],
        "description": "Some description",
        "status": "draft",
        "filter_blocks": [
            {
                "query": "something=else",
                "flags_applied": ["not=true"],
            },
        ],
        "flags": [
            {
                "name": "foo",
                "query": "foo=bar",
            }
        ],
    }
    return post_item(testapp, item, "FilterSet")


def test_filter_set_post(testapp: TestApp, filter_set: Dict[str, Any]) -> None:
    """Ensure properties POST."""
    pass
