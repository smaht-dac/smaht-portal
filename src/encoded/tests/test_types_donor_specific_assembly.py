import pytest
from typing import Dict, Any
from webtest import TestApp

from .utils import get_search, patch_item, get_insert_identifier_for_item_type


@pytest.mark.workbook
def test_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure files rev link works."""
    file_set_search = get_search(
        es_testapp, "?type=DonorSpecificAssembly&files.uuid!=No+value"
    )
    assert file_set_search


# @pytest.mark.workbook
# @pytest.mark.parametrize(
#     "patch_body,expected_status", [({"donor": "TEST_DONOR_FEMALE"}, 422)]
# )
# def test_validate_donor_matches_expected(
#     es_testapp: TestApp,
#     patch_body: Dict[str, Any],
#     expected_status: int,
#     workbook: None,
# ) -> None:
#     """Ensure the validator for donor works."""
#     uuid = get_insert_identifier_for_item_type(es_testapp, "DonorSpecificAssembly")
#     patch_item(patch_body, uuid, expected_status)
