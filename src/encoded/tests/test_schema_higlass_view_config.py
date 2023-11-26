from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def higlass_view_config(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "identifier": "some_view_config",
        "title": "A great view config",
        "view_config": {
            "whatever props": "anything",
        },
        "instance_height": 500,
    }
    return post_item(testapp, item, "HiglassViewConfig")


def test_higlass_view_config_post(higlass_view_config: Dict[str, Any]) -> None:
    pass
