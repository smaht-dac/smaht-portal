from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import (
    patch_item,
    get_insert_identifier_for_item_type,
)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,status",
    [
        ({"concatenated_reads": "No"}, 200),
        ({"concatenated_reads": "No", "target_monomer_size": 1000}, 422),
        ({"concatenated_reads": "Yes"}, 200),
        ({"concatenated_reads": "Yes", "target_monomer_size": 1000}, 200),
    ],
)
def test_target_monomer_size_conditional(
    es_testapp: TestApp, workbook: None, patch_body: Dict[str, Any], status: int
) -> None:
    """Ensure target_monomer_size is only valid if concatenated_reads is Yes."""
    library_uuid = get_insert_identifier_for_item_type(
        testapp=es_testapp, item_type="Library"
    )
    assert patch_item(es_testapp, patch_body, library_uuid, status=status)
