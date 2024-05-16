from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import assert_keys_conflict, post_item

@pytest.fixture
def new_type(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "last_modified": [],
        "date": [],
        "foo_or_bar": "Bar",
        "integer_4_to_50": 31,
        "object_with_add_properties": [],
        "object_without_add_properties": [],
        "number_string": 1234,
        "unique_array": ['a','b','c'],
        "url": "https://github.com/smaht-dac/smaht-portal"
    }
    return post_item(testapp, item, "New File")