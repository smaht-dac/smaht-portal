from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import (
    patch_item,
    get_item_from_search
)
from ..item_utils import item as item_utils


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,status",
    [
        ({"comparators": ["SMAURV9YIJWF"]}, 422),
        ({"comparators_description": ["HELA"]}, 200),
        ({"comparators": ["SMAURV9YIJWF"],"comparators_description": ["HELA"]}, 200),
    ],
)
def test_comparators_dependent_required(
    es_testapp: TestApp, workbook: None, patch_body: Dict[str, Any], status: int
) -> None:
    """Ensure comparators_description is required if comparators is present."""
    uuid = item_utils.get_uuid(
        get_item_from_search(
            es_testapp,
            "VariantCalls",
        )
    )
    assert patch_item(es_testapp, patch_body, uuid, status=status)