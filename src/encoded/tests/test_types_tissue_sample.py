import pytest
from webtest import TestApp

from ..item_utils import (
    item as item_utils,
)

from .utils import (
    get_item,
    get_item_from_search,
    patch_item,
    post_item,
    get_insert_identifier_for_item_type
)

@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for tissue sample within
    Sample collection.
    """
    get_item(es_testapp, "TEST_TISSUE-SAMPLE_LIVER", collection="Sample", status=301)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "sample_source,category,external_id,expected_status", [
        ("TPCTEST_TISSUE_LUNG", "Homogenate", "ST001-1D-001X", 200),
        ("TPCTEST_TISSUE_LUNG", "Homogenate", "ST001-1D-001S9", 422),
        ("TEST_TISSUE_LIVER", "Homogenate", "ST001-1D-001X", 200),
        ("TEST_TISSUE_LIVER", "Homogenate", "ST001-1D-001S9", 200),
        ("TPCTEST_TISSUE_LUNG", "Core", "ST001-1D-001A2", 200),
        ("TPCTEST_TISSUE_LUNG", "Core", "ST001-1D-001S9", 422),
        ("TPCTEST_TISSUE_LUNG", "Core", "ST001-1D-01A2", 422),
        ("TPCTEST_TISSUE_LUNG", "Specimen", "ST001-1D-001S9", 200),
        ("TPCTEST_TISSUE_LUNG", "Specimen", "ST001-1D-001A2", 422),
    ]
)
def test_validate_external_id_on_edit(
    es_testapp: TestApp,
    workbook: None,
    sample_source: str,
    category: str,
    external_id: str,
    expected_status: int
    ) -> None:
    """Ensure external_id is valid based on category if submitter is GCC on edit."""
    uuid = get_insert_identifier_for_item_type(es_testapp, "tissue_sample")
    patch_body = {
        "sample_sources": [sample_source],
        "category": category,
        "external_id": external_id
    }
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "sample_source,category,external_id,expected_status,index", [
        ("TPCTEST_TISSUE_LUNG", "Homogenate", "ST001-1D-001X", 201, 1),
        ("TPCTEST_TISSUE_LUNG", "Homogenate", "ST001-1D-001S9", 422, 2),
        ("TEST_TISSUE_LIVER", "Homogenate", "ST001-1D-001X", 201, 3),
        ("TEST_TISSUE_LIVER", "Homogenate", "ST001-1D-001S9", 201, 4),
        ("TPCTEST_TISSUE_LUNG", "Core", "ST001-1D-001A2", 201, 5),
        ("TPCTEST_TISSUE_LUNG", "Core", "ST001-1D-001S9", 422, 6),
        ("TPCTEST_TISSUE_LUNG", "Core", "ST001-1D-01A2", 422, 7),
        ("TPCTEST_TISSUE_LUNG", "Specimen", "ST001-1D-001S9", 201, 8),
        ("TPCTEST_TISSUE_LUNG", "Specimen", "ST001-1D-001A2", 422, 9),
    ]
)
def test_validate_external_id_on_add(
    es_testapp: TestApp,
    workbook: None,
    sample_source: str,
    category: str,
    external_id: str,
    expected_status: int,
    index: int
) -> None:
    """Ensure external_id is valid based on category if submitter is GCC on add."""
    insert = get_item_from_search(es_testapp, "TissueSample")
    post_body = {
        "submitted_id": f"{item_utils.get_submitted_id(insert)}_{index}",
        "sample_sources": [sample_source],
        "category": category,
        "external_id": external_id
    }
    post_item(es_testapp, post_body, 'tissue_sample', status=expected_status)