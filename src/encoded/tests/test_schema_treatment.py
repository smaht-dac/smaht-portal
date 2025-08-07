from typing import Any, Dict

import pytest
from webtest import TestApp

from .utils import (
    patch_item,
    post_item_and_return_location,
)


@pytest.fixture
def test_treatment(
    testapp,
    test_submission_center
):
    item = {
        "agent": "EtOH",
        "submitted_id": "TEST_TREATMENT_ETOH",
        "submission_centers": [test_submission_center["uuid"]],
        }
    return post_item_and_return_location(testapp, item, 'treatment')


@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        ({"concentration": 6}, 422),
        ({"concentration_units": "M"}, 422),
        (
            {
                "concentration": 6,
                "concentration_units": "M",
            },
            200,
        ),
    ],
)
def test_concentration_requirements(
    patch_body: Dict[str, Any],
    expected_status: int,
    testapp: TestApp,
    test_treatment: Dict[str, Any],
) -> None:
    """Ensure mutual requirements for concentration and concentration_units."""
    patch_item(
        testapp,
        patch_body,
        test_treatment["uuid"],
        status=expected_status,
    )