from typing import Any, Dict

import pytest
from webtest import TestApp

from .utils import (
    patch_item,
    delete_field,
    get_insert_identifier_for_item_type,
)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,delete_fields,expected_status",
    [
        ({"category": "Homogenate", "core_size": "1.5"}, "", 422),
        ({"category": "Core"}, "core_size", 422),
        (
            {
                "category": "Core",
                "core_size": "1.5",
            },
            "", 200,
        ),
    ],
)
def test_core_size_requirements(
    patch_body: Dict[str, Any],
    delete_fields: str,
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure mutual requirements for category "Core" and core_size."""
    uuid = get_insert_identifier_for_item_type(es_testapp, "TissueSample")
    delete_field(
        es_testapp,
        uuid,
        delete_fields,
        patch_body=patch_body,
        status=expected_status,
    )
