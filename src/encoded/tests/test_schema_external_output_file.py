from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import (
    get_item_from_search,
    delete_field
)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,delete_fields,expected_status",
    [
        ({}, "", 200),
        ({"file_sets": ["TEST_FILE-SET_LUNG-HOMOGENATE-DNA"]}, "tissues", 200), # only file_sets
        ({"source_donors": ["TEST_DONOR_MALE"]}, "file_sets", 200), # only donors
        ({"tissues": ["TEST_TISSUE_LUNG"]}, "source_donors", 200), # only tissues
        ({"file_sets": ["TEST_FILE-SET_LUNG-HOMOGENATE-DNA"],"tissues": ["TEST_TISSUE_LUNG"]}, "tissues", 200), # file_sets and tissues
        ({"source_donors": ["TEST_DONOR_MALE"]}, "file_sets", 200), # all
        ({}, "tissues,file_sets,source_donors", 422), # none
        ({"tissues": ["TEST_TISSUE_LUNG"]}, "file_sets,source_donors", 200), # back to original state
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
    eof_item = get_item_from_search(es_testapp, "external_output_file")
    delete_field(
        es_testapp,
        eof_item["uuid"],
        delete_fields,
        patch_body=patch_body,
        status=expected_status,
    )