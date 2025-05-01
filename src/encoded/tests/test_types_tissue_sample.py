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
def test_validate_external_id_matches_tissue_on_edit(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int
    ) -> None:
    """Ensure external_id is valid based on category if tissue is Benchmarking or Production on edit."""
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
def test_validate_external_id_matches_tissue_on_add(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
    index: int
) -> None:
    """Ensure external_id is valid based on category if tissue is Benchmarking or Production on add."""
    insert = get_item_from_search(es_testapp, "TissueSample")
    post_body = {
        **patch_body,
        "submitted_id": f"{item_utils.get_submitted_id(insert)}_{index}",
        'submission_centers': item_utils.get_submission_centers(insert),
    }
    post_item(es_testapp, post_body, 'tissue_sample', status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "submitted_id,patch_body,expected_status", [
        (
            "NDRITEST_TISSUE-SAMPLE_TEST_1",
            {
                "submission_centers": ["ndri_tpc"],
                "sample_sources": ["TEST_TISSUE_LUNG"],
                "category": "Homogenate",
                "external_id": "ST001-1D-001S9"
            }, 422
        ),
        (
            "NDRITEST_TISSUE-SAMPLE_TEST_4",
            {
                "submission_centers": ["ndri_tpc"],
                "sample_sources": ["TEST_TISSUE_LUNG"],
                "category": "Specimen",
                "external_id": "ST001-1D-001S9"
            }, 201
        ),
        (
            "NDRITEST_TISSUE-SAMPLE_TEST_5",
            {
                "submission_centers": ["ndri_tpc"],
                "sample_sources": ["TEST_TISSUE_LUNG"],
                "category": "Specimen",
                "external_id": "ST001-1D-001A2"
            }, 422
        ),
        (
            "NDRITEST_TISSUE-SAMPLE_TEST_6",
            {
                "submission_centers": ["ndri_tpc"],
                "sample_sources": ["TEST_TISSUE_LUNG"],
                "category": "Core", "core_size": "1.5",
                "external_id": "ST001-1D-001A2"
            }, 201
        ),
        (
            "NDRITEST_TISSUE-SAMPLE_TEST_7",
            {
                "submission_centers": ["ndri_tpc"],
                "sample_sources": ["TEST_TISSUE_LUNG"],
                "category":"Core",
                "core_size": "1.5",
                "external_id": "ST001-1D-001S9"
            }, 422
        ),
        (
            "NDRITEST_TISSUE-SAMPLE_TEST_8",
            {
                "submission_centers": ["ndri_tpc"],
                "sample_sources": ["TEST_TISSUE_LUNG"],
                "category": "Core",
                "core_size": "1.5",
                "external_id": "ST001-1D-01A2"
            }, 422
        ),
        (
            "TEST_TISSUE-SAMPLE_TEST_9",
            {
                "submission_centers": ["smaht"],
                "sample_sources": ["TEST_TISSUE_LUNG"],
                "category": "Core",
                "core_size": "1.5",
                "external_id": "ST001-1D-01A2"
            }, 201
        ),
    ]
)
def test_validate_external_id_category_on_add(
    es_testapp: TestApp,
    workbook: None,
    submitted_id: str,
    patch_body: Dict[str, Any],
    expected_status: int,
) -> None:
    """Ensure external_id is valid based on category if tissue is Benchmarking or Production on edit."""
    post_body = {
        **patch_body,
        "submitted_id": submitted_id,
    }
    post_item(es_testapp, post_body, 'tissue_sample', status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"sample_sources": ["TEST_TISSUE_LUNG"], "category": "Homogenate", "preservation_type": "Snap Frozen"}, 200),
        ({"sample_sources": ["TEST_TISSUE_LUNG"], "category": "Homogenate", "preservation_type": "Fresh"}, 422),
    ]
)
def test_validate_tissue_sample_metadata_on_edit(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
) -> None:
    """Ensure metadata matches TPC tissue sample metadata with the same external_id."""
    uuid = item_utils.get_uuid(
        get_item(
            es_testapp,
            "TEST_TISSUE-SAMPLE_LUNG-HOMOGENATE",
            collection="TissueSample"
        )
    )
    patch_item(es_testapp, patch_body, uuid, status=expected_status)
                                             

@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status,index", [
        ({"sample_sources": ["TEST_TISSUE_LUNG"], "category": "Homogenate", "preservation_type": "Snap Frozen"}, 201, 1),
        ({"sample_sources": ["TEST_TISSUE_LUNG"], "category": "Homogenate", "preservation_type": "Fresh"}, 422, 2),
    ]
)
def test_validate_tissue_sample_metadata_on_add(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
    index: int
) -> None:
    """Ensure metadata matches TPC tissue sample metadata with the same external_id."""
    insert = get_item(
            es_testapp,
            "TEST_TISSUE-SAMPLE_LUNG-HOMOGENATE",
            collection="TissueSample"
        )
    post_body = {
        **patch_body,
        "submitted_id": f"{item_utils.get_submitted_id(insert)}_{index}",
        'submission_centers': item_utils.get_submission_centers(insert),
        'external_id': item_utils.get_external_id(insert)
    }
    post_item(es_testapp, post_body, 'tissue_sample', status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"sample_sources": ["TEST_TISSUE_BLOOD"], "external_id": "SMHT001-3A-001X", "category": "Liquid"}, 200),
        ({"sample_sources": ["TEST_TISSUE_BLOOD"], "external_id": "SMHT001-3A-001X", "category": "Specimen"}, 422),
    ]
)
def test_validate_tissue_category_on_edit(
   es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,     
) -> None:
    """Ensure category is Liquid for tissue samples with external_ids for blood, buccal swab, or fibroblasts."""
    uuid = item_utils.get_uuid(
        get_item(
            es_testapp,
            "TEST_TISSUE-SAMPLE_BLOOD",
            collection="TissueSample"
        )
    )
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status,index", [
        ({"sample_sources": ["TEST_TISSUE_BLOOD"], "external_id": "SMHT001-3A-001X", "category": "Liquid"}, 201, 1),
        ({"sample_sources": ["TEST_TISSUE_BLOOD"], "external_id": "SMHT001-3A-001X", "category": "Specimen"}, 422, 2),
    ]
)
def test_validate_tissue_category_on_add(
   es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
    index: int  
) -> None:
    """Ensure category is Liquid for tissue samples with external_ids for blood, buccal swab, or fibroblasts."""
    insert = get_item(
            es_testapp,
            "TEST_TISSUE-SAMPLE_BLOOD",
            collection="TissueSample"
    )
    post_body = {
        **patch_body,
        "submitted_id": f"{item_utils.get_submitted_id(insert)}_{index}",
        'submission_centers': item_utils.get_submission_centers(insert)
    }
    post_item(es_testapp, post_body, 'tissue_sample', status=expected_status)


def test_tissue_sample_force_pass(
        testapp: TestApp,
        test_tissue_sample: Dict[str, Any]
    ) -> None:
    """ Tests that we can skip validation check by passing ?force_pass to patch invalid metadata to tissue sample."""
    atid = test_tissue_sample['@id']
    testapp.patch_json(f'/{atid}', {'external_id': 'SMHT001-3A-001X'}, status=422)  # fails without force_pass
    testapp.patch_json(f'/{atid}?force_pass', {'external_id': 'SMHT001-3A-001X'}, status=200)
