from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import (
    patch_item,
    post_item_and_return_location
)


@pytest.fixture
def test_library_preparation(
    testapp,
    test_submission_center
):
    item = {
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_LIBRARY-PREPARATION_HELA",
    }
    return post_item_and_return_location(testapp, item, 'library_preparation')


@pytest.mark.parametrize(
    "patch_body,status",
    [
        ({"restriction_enzymes": ["AluI"]}, 422),
        ({"fragmentation_method": ["Transposase"]}, 200),
        ({"fragmentation_method": ["Restriction Enzyme"]}, 422),
        ({"fragmentation_method": ["Restriction Enzyme"], "restriction_enzymes": ["AluI"]}, 200),
       ({"fragmentation_method": ["Restriction Enzyme","Transposase"], "restriction_enzymes": ["AluI"]}, 200),
       ({"fragmentation_method": ["Transposase"], "restriction_enzymes": ["AluI"]}, 422),
    ],
)
def test_restiction_enzyme_conditional(
    testapp: TestApp, test_library_preparation: Dict[str, Any], patch_body: Dict[str, Any], status: int
) -> None:
    """Ensure restriction_enzymes is only valid if fragmentation_method contains Restriction Enzyme."""
    library_prep_uuid = test_library_preparation["uuid"]
    assert patch_item(testapp, patch_body, library_prep_uuid, status=status)

