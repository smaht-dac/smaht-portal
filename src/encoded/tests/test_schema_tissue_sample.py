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
        ({"category": "Homogenate", "core_size": "1.5"}, 422),
        ({"category": "Core", "core_size": ""}, 422),
        (
            {
                "category": "Core",
                "core_size": "1.5",
            },
            200,
        ),
    ],
)
def test_core_size_requirements(
    patch_body: Dict[str, Any],
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure mutual requirements for category "Core" and core_size."""
    uuid = get_insert_identifier_for_item_type(es_testapp, "TissueSample")
    patch_item(
        es_testapp,
        patch_body,
        uuid,
        status=expected_status,
    )
