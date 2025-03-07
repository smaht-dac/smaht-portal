from typing import Dict, Any
import pytest
from webtest import TestApp

from ..item_utils import (
    item as item_utils,
    tissue as tissue_utils,
)

from .utils import (
    get_item,
    get_item_from_search,
    patch_item,
    post_item,
)


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for tissue within
    SampleSource collection.
    """
    get_item(es_testapp, "TEST_TISSUE_LIVER", collection="SampleSource", status=301)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"donor": "TEST_DONOR_ALT1", "external_id": "ST001-1D"}, 200),
        ({"donor": "TEST_DONOR_FEMALE", "external_id": "ST001-1D"}, 422),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1D"}, 200),
    ]
)
def test_validate_external_id_on_edit(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int
    ) -> None:
    """Ensure external_id matches donor external_id if Benchmarking or Production on edit."""
    uuid = item_utils.get_uuid(
        get_item(
            es_testapp,
            "TEST_TISSUE_LUNG",
            collection="TissueSample"
        )
    )
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status,index", [
        ({"donor": "TEST_DONOR_ALT1", "external_id": "ST001-1D"}, 201, 1),
        ({"donor": "TEST_DONOR_FEMALE", "external_id": "ST001-1D"}, 422, 2),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1D"}, 201, 3),
    ]
)
def test_validate_external_id_on_add(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
    index: int
) -> None:
    """Ensure external_id matches donor external_id if Benchmarking or Production on add."""
    insert = get_item_from_search(es_testapp, "Tissue")
    post_body = {
        **patch_body,
        "submitted_id": f"{item_utils.get_submitted_id(insert)}_{index}",
        'submission_centers': item_utils.get_submission_centers(insert),
        "uberon_id": tissue_utils.get_uberon_id(insert)
    }
    post_item(es_testapp, post_body, 'tissue', status=expected_status)