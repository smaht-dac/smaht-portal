import pytest
from webtest import TestApp

from ..item_utils import (
    item as item_utils,
    sample as sample_utils
)

from .utils import (
    get_item,
    get_item_from_search,
    patch_item,
    post_item
)

@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for tissue sample within
    Sample collection.
    """
    get_item(es_testapp, "TEST_TISSUE-SAMPLE_LIVER", collection="Sample", status=301)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "submission_center,category,external_id,expected_status", [
        ("smaht", "Homogenate", "ST001-1D-001X", 200),
        ("smaht", "Homogenate", "ST001-1D-001S9", 422),
        ("ttd", "Homogenate", "ST001-1D-001X", 200),
        ("ttd", "Homogenate", "ttd_external_id", 200),
        ("tpc", "Homogenate", "ST001-1D-001X", 200),
        ("tpc", "Core", "ST001-1D-001A2", 200),
        ("tpc", "Core", "ST001-1D-001S9", 422),
        ("tpc", "Core", "ST001-1D-01A2", 422),
        ("tpc", "Homogenate", "ST001-1D-001S9", 422),
        ("gcc", "Homogenate", "ST001-1D-001S9", 422),
        ("gcc", "Homogenate", "ST001-1D-001X", 200),
        ("gcc", "Specimen", "ST001-1D-001S9", 200),
        ("gcc", "Specimen", "ST001-1D-001A2", 422),

    ]
)
def test_validate_external_id_on_edit(
    es_testapp: TestApp,
    workbook: None,
    submission_center: str,
    category: str,
    external_id: str,
    expected_status: int
    ) -> None:
    """Ensure external_id is valid based on category if submitter is GCC on edit."""
    uuid = item_utils.get_uuid(
        get_item_from_search(es_testapp, 'TissueSample', add_on=f"&submission_centers.identifier={submission_center}")
    )
    patch_body = {
        "submission_centers": [submission_center],
        "category": category,
        "external_id": external_id
    }
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "submission_center,category,external_id,expected_status,index", [
        ("smaht", "Homogenate", "ST001-1D-001X", 201, 1),
        ("smaht", "Homogenate", "ST001-1D-001S9", 422, 2),
        ("ttd", "Homogenate", "ST001-1D-001X", 201, 3),
        ("ttd", "Homogenate", "ttd_external_id", 201, 4),
        ("tpc", "Homogenate", "ST001-1D-001X", 201, 5),
        ("tpc", "Homogenate", "ST001-1D-001S9", 422, 6),
        ("tpc", "Core", "ST001-1D-001A2", 201, 7),
        ("tpc", "Core", "ST001-1D-001S9", 422, 8),
        ("tpc", "Core", "ST001-1D-01A2", 422, 9),
        ("gcc", "Homogenate", "ST001-1D-001X", 201, 10),
        ("gcc", "Homogenate", "ST001-1D-001S9", 422, 11),
        ("gcc", "Specimen", "ST001-1D-001S9", 201, 12),
        ("gcc", "Specimen", "ST001-1D-001A2", 422, 13),
    ]
)
def test_validate_external_id_on_add(
    es_testapp: TestApp,
    workbook: None,
    submission_center: str,
    category: str,
    external_id: str,
    expected_status: int,
    index: int
) -> None:
    """Ensure external_id is valid based on category if submitter is GCC on add."""
    insert = get_item_from_search(es_testapp, 'TissueSample', add_on=f"&submission_centers.identifier={submission_center}")
    post_body = {
        "submitted_id": f"{item_utils.get_submitted_id(insert)}_{index}",
        "sample_sources": sample_utils.get_sample_sources(insert),
        "submission_centers": [submission_center],
        "category": category,
        "external_id": external_id
    }
    post_item(es_testapp, post_body, 'tissue_sample', status=expected_status)