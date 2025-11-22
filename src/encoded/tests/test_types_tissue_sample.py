from typing import Dict, Any

import pytest
from webtest import TestApp

from ..item_utils import (
    item as item_utils,
)

from .utils import (
    get_item,
    get_item_from_search,
    get_identifying_insert,
    patch_item,
    post_item,
    assert_validation_error_as_expected,
    to_snake_case,
)


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for tissue sample within
    Sample collection.
    """
    get_item(es_testapp, "NDRITEST_TISSUE-SAMPLE_LIVER_TPC", collection="Sample", status=301)


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
    uuid = item_utils.get_uuid(get_item_from_search(es_testapp, "TissueSample", add_on="&category!=Core"))
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
    """Ensure TPC proviced external_id is valid based on category if tissue is Benchmarking or Production on add."""
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
        )
    ]
)
def test_validate_external_id_category_on_add(
    es_testapp: TestApp,
    workbook: None,
    submitted_id: str,
    patch_body: Dict[str, Any],
    expected_status: int,
) -> None:
    """Ensure TPC provided external_id is valid based on category if tissue 
        is Benchmarking or Production on edit."""
    post_body = {
        **patch_body,
        "submitted_id": submitted_id,
    }
    post_item(es_testapp, post_body, 'tissue_sample', status=expected_status)


def create_tissue_sample_for_testing(
    es_testapp: TestApp,
    submitted_id: str,
    tpc_submitted_id: str,
    item_type: str
) -> Dict[str, Any]:
    """Get or create test item for testing."""
    try:
        uuid = get_item(es_testapp, submitted_id, collection=item_type).get('uuid')
    except Exception:
        uuid = None
    if not (uuid):
        tpc_item = get_item(
                es_testapp,
                tpc_submitted_id,
                collection=item_type,
                frame="raw"
            )
        test_item_post = {
            "submitted_id": submitted_id,
            "submission_centers": [get_item(es_testapp, "smaht", collection="SubmissionCenter")['uuid']],
            "sample_sources": tpc_item.get("sample_sources"),
            "external_id": tpc_item.get("external_id"),
            "category": tpc_item.get("category"),
            "preservation_type": tpc_item.get("preservation_type"),
        }
        return post_item(es_testapp, test_item_post, 'tissue_sample', status=201)
    return get_item(es_testapp, submitted_id, collection=item_type)


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
    TEST_ITEM_ID = "TEST_TISSUE-SAMPLE_LUNG-HOMOGENATE-X_TEST"
    TPC_TEST_ITEM_ID = "NDRITEST_TISSUE-SAMPLE_LUNG-HOMOGENATE-X_TPC"
    ITEM_TYPE = "TissueSample"
    uuid = create_tissue_sample_for_testing(es_testapp, TEST_ITEM_ID,
                                            TPC_TEST_ITEM_ID, ITEM_TYPE).get('uuid')
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
    TEST_ITEM_ID = "TEST_TISSUE-SAMPLE_LUNG-HOMOGENATE-X_TEST"
    ITEM_TYPE = "TissueSample"
    TPC_TEST_ITEM_ID = "NDRITEST_TISSUE-SAMPLE_LUNG-HOMOGENATE-X_TPC"
    insert = create_tissue_sample_for_testing(es_testapp, TEST_ITEM_ID,
                                              TPC_TEST_ITEM_ID, ITEM_TYPE)
    post_body = {
        **patch_body,
        "submitted_id": f"{item_utils.get_submitted_id(insert)}_{index}",
        'submission_centers': item_utils.get_submission_centers(insert),  # test submission center
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
    uuid = item_utils.get_uuid(get_item(es_testapp, "NDRITEST_TISSUE-SAMPLE_BLOOD_TPC", collection="TissueSample"))
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
            "NDRITEST_TISSUE-SAMPLE_BLOOD_TPC",
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


@pytest.mark.workbook
def test_tissue_sample_without_tpc_sample(
        es_testapp: TestApp,
        workbook: None
) -> None:
    """ Tests that we get an error if no TPC tissue sample exists for the given external_id."""
    item = {
        "submitted_id": "TEST_TISSUE-SAMPLE_NO_TPC_TEST",
        "submission_centers": ["smaht"],
        "sample_sources": ["TEST_TISSUE_LIVER"],
        "external_id": "SMHT001-1A-100A6",
        "category": "Core",
        "core_size": "1.5"
    }
    res = post_item(es_testapp, item, 'tissue_sample', status=422)
    assert_validation_error_as_expected(res, location='body', name_start='TissueSample: No TPC Tissue Sample')


# @pytest.mark.workbook
# def test_tissue_sample_with_dup_external_id_sample_on_add(
#         es_testapp: TestApp,
#         workbook: None,
#         testapp: TestApp,
# ) -> None:
#     """ Tests that we get an error on post if a non-TPC tissue sample already exists with the same external_id."""
#     TEST_TPC_SAMPLE_ID = "NDRITEST_TISSUE-SAMPLE_LUNG-CORE_TPC"
#     items_to_post_for_setup = {}
#     items_to_post_for_setup.setdefault(to_snake_case("Consortium"), []).append(
#         get_identifying_insert(
#             es_testapp,
#             get_item(es_testapp, "smaht", collection="Consortium", frame="raw"),
#             to_snake_case("Consortium")
#         )
#     )
#     items_to_post_for_setup.setdefault(to_snake_case("SubmissionCenter"), []).append(
#         get_identifying_insert(
#             es_testapp,
#             get_item(es_testapp, "ndri_tpc", collection="SubmissionCenter", frame="raw"),
#             to_snake_case("SubmissionCenter")
#         )
#     )
#     items_to_post_for_setup.setdefault(to_snake_case("SubmissionCenter"), []).append(
#         get_identifying_insert(
#             es_testapp,
#             get_item(es_testapp, "smaht", collection="SubmissionCenter", frame="raw"),
#             to_snake_case("SubmissionCenter")
#         )
#     )
#     items_to_post_for_setup.setdefault(to_snake_case("Ontology"), []).append(
#         get_identifying_insert(
#             es_testapp,
#             get_item(es_testapp, "UBERON", collection="Ontology", frame="raw"),
#             to_snake_case("Ontology")
#         )
#     )
#     items_to_post_for_setup.setdefault(to_snake_case("OntologyTerm"), []).append(
#         get_identifying_insert(
#             es_testapp,
#             get_item(es_testapp, "UBERON:0000925", collection="OntologyTerm", frame="raw"),
#             to_snake_case("OntologyTerm")
#         )
#     )
#     items_to_post_for_setup.setdefault(to_snake_case("OntologyTerm"), []).append(
#         get_identifying_insert(
#             es_testapp,
#             get_item(es_testapp, "UBERON:0008952", collection="OntologyTerm", frame="raw"),
#             to_snake_case("OntologyTerm")
#         )
#     )
#     items_to_post_for_setup.setdefault(to_snake_case("Donor"), []).append(
#         get_identifying_insert(
#             es_testapp,
#             get_item(es_testapp, "TEST_DONOR_MALE", collection="Donor", frame="raw"),
#             to_snake_case("Donor")
#         )
#     )
#     items_to_post_for_setup.setdefault(to_snake_case("Tissue"), []).append(
#         get_identifying_insert(
#             es_testapp,
#             get_item(es_testapp, "TEST_TISSUE_LUNG", collection="Tissue", frame="raw"),
#             to_snake_case("Tissue")
#         )
#     )
#     items_to_post_for_setup.setdefault(to_snake_case("TissueSample"), []).append(
#         get_identifying_insert(
#             es_testapp,
#             get_item(es_testapp, TEST_TPC_SAMPLE_ID, collection="TissueSample", frame="raw"),
#             to_snake_case("TissueSample")
#         )
#     )
#     for item_type, posts in items_to_post_for_setup.items():
#         for post_body in posts:
#             post_item(testapp, post_body, item_type, status=201)

#     FIRST_TEST_ITEM_ID = "TEST_TISSUE-SAMPLE_LUNG-CORE_TEST"
#     SECOND_TEST_ITEM_ID = "TEST_TISSUE-SAMPLE_LUNG-CORE_TEST_DUP"
#     ITEM_TYPE = "TissueSample"
#     collection = to_snake_case(ITEM_TYPE)
#     item = get_item(testapp, TEST_TPC_SAMPLE_ID, collection=ITEM_TYPE, frame="raw")
#     item = get_identifying_insert(testapp, item, collection)
#     for prop in ['uuid', 'accession']:
#         item.pop(prop, None)

#     # post first non-TPC tissue sample with given external_id
#     item['submitted_id'] = FIRST_TEST_ITEM_ID
#     item['submission_centers'] = [get_item(testapp, "smaht", collection="SubmissionCenter")['uuid']]
#     res = post_item(testapp, item, collection, status=201)

#     # post second non-TPC tissue sample with same external_id and expect error
#     item['submitted_id'] = SECOND_TEST_ITEM_ID
#     res = post_item(testapp, item, collection, status=422)
#     assert_validation_error_as_expected(res, location='body', name_start="TissueSample: Error a non-TPC sample")
