from typing import Any, Dict

import pytest
from webtest import TestApp

from .utils import (
    patch_item,
    get_insert_identifier_for_item_type,
)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        ({"size": 5}, 422),
        ({"size_unit": "cm^3"}, 422),
        (
            {
                "size": 5,
                "size_unit": "cm^3",
            },
            200,
        ),
    ],
)
def test_size_unit_requirements(
    patch_body: Dict[str, Any],
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure mutual requirements for size and size_unit."""
    uuid = get_insert_identifier_for_item_type(es_testapp, "Tissue")
    patch_item(
        es_testapp,
        patch_body,
        uuid,
        status=expected_status,
    )
