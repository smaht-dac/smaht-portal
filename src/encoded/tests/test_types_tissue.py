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
        ({"donor": "TEST_DONOR_ALT1", "external_id": "ST001-1D", "uberon_id": "UBERON:0008952"}, 200),
        ({"donor": "TEST_DONOR_FEMALE", "external_id": "ST001-1D", "uberon_id": "UBERON:0008952"}, 422),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1D", "uberon_id": "UBERON:0008952"}, 200),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1D", "uberon_id": "UBERON:0000955"}, 422),
        ({"donor": "TEST_DONOR_FEMALE", "external_id": "SL001-1D", "uberon_id": "UBERON:0008952"}, 422),
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
            collection="Tissue"
        )
    )
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status,index", [
        ({"donor": "TEST_DONOR_ALT1", "external_id": "ST001-1D", "uberon_id": "UBERON:0008952"}, 201, 1),
        ({"donor": "TEST_DONOR_FEMALE", "external_id": "ST001-1D", "uberon_id": "UBERON:0008952"}, 422, 2),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1D", "uberon_id": "UBERON:0008952"}, 201, 3),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1D", "uberon_id": "UBERON:0000955"}, 422, 4),
        ({"donor": "TEST_DONOR_FEMALE", "external_id": "SL001-1D", "uberon_id": "UBERON:0008952"}, 422, 5),

    ]
)
def test_validate_external_id_on_add(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
    index: int
) -> None:
    """Ensure external_id matches donor external_id and uberon_id if Benchmarking or Production on add."""
    insert = get_item_from_search(es_testapp, "Tissue")
    post_body = {
        **patch_body,
        "submitted_id": f"{item_utils.get_submitted_id(insert)}_{index}",
        'submission_centers': item_utils.get_submission_centers(insert),
    }
    post_item(es_testapp, post_body, 'tissue', status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "submitted_id,expected", [
        ("TEST_TISSUE_LUNG", "Endoderm"),
        ("TEST_TISSUE_BLOOD", "Clinically Accessible"),
        ("TEST_TISSUE_BRAIN", "Ectoderm"),
        ("TEST_TISSUE_FIBROBLAST", "Mesoderm")
    ]
)
def test_category_calc_prop(
    es_testapp: TestApp,
    workbook: None,
    submitted_id: str,
    expected: str
) -> None:
    """Ensure the category calculated property works as expected."""
    insert = get_item(
        es_testapp,
        submitted_id,
        collection="Tissue"
    )
    assert insert.get("category","") == expected