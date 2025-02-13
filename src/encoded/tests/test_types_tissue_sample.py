from typing import Dict, Any

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
)

@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for tissue sample within
    Sample collection.
    """
    get_item(es_testapp, "TEST_TISSUE-SAMPLE_LIVER", collection="Sample", status=301)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"sample_sources": ["TEST_TISSUE_LUNG"], "category": "Homogenate", "external_id": "ST001-1D-001X"}, 200),
        ({"sample_sources": ["TEST_TISSUE_LUNG_ALT1"], "category": "Homogenate", "external_id": "ST001-1D-001X"}, 200),
        ({"sample_sources": ["TEST_TISSUE_LUNG_ALT1"], "category": "Homogenate", "external_id": "ST001-1D-001S9"}, 200),
        ({"sample_sources": ["TEST_TISSUE_LIVER"], "category": "Specimen", "external_id": "ST001-1D-001S9"}, 422),
    ]
)
def test_validate_external_id_on_edit(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int
    ) -> None:
    """Ensure external_id matches tissue external_id if Benchmarking or Production on edit."""
    uuid =  item_utils.get_uuid(get_item_from_search(es_testapp, "TissueSample", add_on="&category!=Core"))
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status,index", [
        ({"sample_sources": ["TEST_TISSUE_LUNG"], "category": "Homogenate", "external_id": "ST001-1D-001X"}, 201, 1),
        ({"sample_sources": ["TEST_TISSUE_LUNG_ALT1"], "category": "Homogenate", "external_id": "ST001-1D-001X"}, 201, 3),
        ({"sample_sources": ["TEST_TISSUE_LUNG_ALT1"], "category": "Homogenate", "external_id": "ST001-1D-001S9"}, 201, 4),
        ({"sample_sources": ["TEST_TISSUE_LIVER"], "category": "Specimen", "external_id": "ST001-1D-001S9"}, 422, 5),
    ]
)
def test_validate_external_id_on_add(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
    index: int
) -> None:
    """Ensure external_id matches tissue external_id if Benchmarking or Production on add."""
    insert = get_item_from_search(es_testapp, "TissueSample")
    post_body = {
        **patch_body,
        "submitted_id": f"{item_utils.get_submitted_id(insert)}_{index}",
        'submission_centers': item_utils.get_submission_centers(insert),
    }
    post_item(es_testapp, post_body, 'tissue_sample', status=expected_status)