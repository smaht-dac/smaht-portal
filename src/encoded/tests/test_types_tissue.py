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
    """Ensure submitted_id is resource path for tissue within
    SampleSource collection.
    """
    get_item(es_testapp, "TEST_TISSUE_LIVER", collection="SampleSource", status=301)


@pytest.mark.workbook
def test_pathology_summary_target_tissues(es_testapp: TestApp, workbook: None) -> None:
    """Ensure pathology_summary.target_tissues surfaces the per-subtype
    breakdown from the tissue's own pathology report(s), un-collapsed.

    TEST_TISSUE_LIVER rev-links to NDRITEST_TISSUE-SAMPLE_LIVER_TPC, whose
    single NonBrainPathologyReport (TEST_NON-BRAIN-PATHOLOGY-REPORT_SMHT001-1A-100A1)
    has exactly 1 target_tissues entry (Liver, [50-100], no autolysis score) --
    see data/workbook-inserts/non_brain_pathology_report.json.
    """
    tissue = get_item(es_testapp, "TEST_TISSUE_LIVER", collection="Tissue")
    pathology_summary = tissue.get("pathology_summary")
    assert pathology_summary is not None
    assert pathology_summary.get("target_tissues") == [
        {"subtype": "Liver", "percentage": "[50-100]", "autolysis_score": None}
    ]
    # The existing, unrelated scalar fields stay populated exactly as before.
    assert pathology_summary.get("target_tissue_percentage") == "[50-100]"


@pytest.mark.workbook
def test_pathology_summary_non_target_tissues(es_testapp: TestApp, workbook: None) -> None:
    """Ensure pathology_summary.non_target_tissues surfaces the per-subtype
    breakdown from the tissue's own pathology report(s), un-collapsed --
    same convention as target_tissues (test_pathology_summary_target_tissues
    above), but with no per-subtype autolysis_score (non_target_tissues
    entries don't have that field at all).

    TEST_TISSUE_LIVER's same NonBrainPathologyReport
    (TEST_NON-BRAIN-PATHOLOGY-REPORT_SMHT001-1A-100A1) has exactly 1
    non_target_tissues entry (Fibroadipose, [0-10]) -- see
    data/workbook-inserts/non_brain_pathology_report.json.
    """
    tissue = get_item(es_testapp, "TEST_TISSUE_LIVER", collection="Tissue")
    pathology_summary = tissue.get("pathology_summary")
    assert pathology_summary is not None
    assert pathology_summary.get("non_target_tissues") == [
        {"subtype": "Fibroadipose", "percentage": "[0-10]"}
    ]
    assert pathology_summary.get("non_target_tissue_percentage") == "[0-10]"


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"donor": "TEST_DONOR_ALT1", "external_id": "ST001-1D", "uberon_id": "UBERON:0008952"}, 200),
        ({"donor": "TEST_DONOR_FEMALE", "external_id": "ST001-1D", "uberon_id": "UBERON:0008952"}, 422),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1D", "uberon_id": "UBERON:0000955"}, 422),
        ({"donor": "TEST_DONOR_FEMALE", "external_id": "SL001-1D", "uberon_id": "UBERON:0008952"}, 422),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1F", "uberon_id": "UBERON:0008952", "preservation_type": "FOO",}, 422),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1F", "uberon_id": "UBERON:0008952", "preservation_type": "Fixed"}, 200),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1D", "uberon_id": "UBERON:0008952", "preservation_type": "Frozen"}, 200),
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
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1D", "uberon_id": "UBERON:0000955"}, 422, 4),
        ({"donor": "TEST_DONOR_FEMALE", "external_id": "SL001-1D", "uberon_id": "UBERON:0008952"}, 422, 5),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1F", "uberon_id": "UBERON:0008952", "preservation_type": "FOO"}, 422, 6),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1F", "uberon_id": "UBERON:0008952", "preservation_type": "Fixed"}, 201, 7),
        ({"donor": "TEST_DONOR_MALE", "external_id": "ST001-1D", "uberon_id": "UBERON:0008952", "preservation_type": "Frozen"}, 201, 3),
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
