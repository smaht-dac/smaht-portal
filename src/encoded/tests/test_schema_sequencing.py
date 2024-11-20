from typing import Any, Dict

import pytest
from webtest import TestApp

from .utils import delete_field, get_item_from_search


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,delete_fields,expected_status",
    [
        ({}, "", 200),
        ({"target_read_count": 200}, "target_coverage", 200),
<<<<<<< HEAD
        ({"target_coverage": 200.0, "target_read_count": 200}, "", 200),
        ({}, "target_coverage,target_read_count", 422),
        ({"target_coverage": 200.0}, "target_read_count", 200),
=======
        ({"on_target_rate": 200}, "target_read_count,target_coverage", 200),
        ({"target_coverage": 200.0, "target_read_count": 200}, "on_target_rate", 200),
        ({"target_coverage": 200.0, "on_target_rate": 200}, "target_read_count", 200),
        ({}, "target_coverage,target_read_count,on_target_rate", 422),
>>>>>>> main
    ],
)
def test_any_of_requirements(
    patch_body: Dict[str, Any],
    delete_fields: str,
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure anyOf requirements properly enforced."""
    sequencing_item = get_item_from_search(es_testapp, "sequencing")
    delete_field(
        es_testapp,
        sequencing_item["uuid"],
        delete_fields,
        patch_body=patch_body,
        status=expected_status,
    )
