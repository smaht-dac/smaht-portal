import pytest
from webtest.app import TestApp
from typing import Dict, Any

from .utils import patch_item, get_item_from_search, post_item

from ..item_utils import item as item_utils


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"assay": "bulk_rna_seq", "analytes": ["TEST_ANALYTE_HELA-RNA"]}, 200), # RNA assay and RNA analyte
        ({"assay": "bulk_fiberseq", "analytes": ["TEST_ANALYTE_HELA-RNA"]}, 422), # DNA assay and RNA analyte
        (
            {
                "assay": "bulk_rna_seq",
                "analytes": ["TEST_ANALYTE_HELA-RNA"],
                "concatenated_reads": "Yes",
                "target_monomer_size": 10000
            }, 422
        ), #MAS ISO-Seq properties and incompatible assay
        (
            {
                "assay": "bulk_mas_iso_seq",
                "analytes": ["TEST_ANALYTE_HELA-RNA"],
                "concatenated_reads": "Yes",
                "target_monomer_size": 10000
            }, 200 #MAS ISO-Seq properties and compatible assay
        ),
    ]
)
def test_validate_rna_library_properties_on_patch(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure RNA library assay, and analytes, and RNA properties validated on PATCH."""
    identifier = item_utils.get_uuid(
        get_item_from_search(
            es_testapp, 'library', add_on="&assay.display_title=RNA-Seq"
        )
    )
    patch_item(es_testapp, patch_body, identifier, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"assay": "bulk_wgs", "analytes": ["TEST_ANALYTE_LIVER-DNA"]}, 200), # DNA assay and DNA analyte
        ({"assay": "bulk_rna_seq", "analytes": ["TEST_ANALYTE_LIVER-DNA"]}, 422), #RNA assay and DNA analyte patch
    ]
)
def test_validate_dna_library_properties_on_patch(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure DNA library assay, and analytes, and DNA properties validated on PATCH."""
    identifier = item_utils.get_uuid(
        get_item_from_search(
            es_testapp, 'library', add_on="&analytes.molecule=DNA"
        )
    )
    patch_item(es_testapp, patch_body, identifier, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "post_body,expected_status,index", [
        ({"assay": "bulk_rna_seq", "analytes": ["TEST_ANALYTE_HELA-RNA"]}, 201, 1), # RNA assay and analyte
        ({"assay": "bulk_fiberseq", "analytes": ["TEST_ANALYTE_HELA-RNA"]}, 422, 2), #DNA assay and RNA analyte
        (
            {
                "assay": "bulk_rna_seq",
                "analytes": ["TEST_ANALYTE_HELA-RNA"],
                "concatenated_reads": "Yes",
                "target_monomer_size": 10000
            }, 422, 3
        ), #MAS ISO-Seq properties and incompatible assay
        (
            {
                "assay": "bulk_mas_iso_seq",
                "analytes": ["TEST_ANALYTE_HELA-RNA"],
                "concatenated_reads": "Yes",
                "target_monomer_size": 10000
            }, 201, 4 #MAS ISO-Seq properties and compatible assay
        ),
    ]
)
def test_validate_rna_library_properties_on_post(
    es_testapp: TestApp,
    workbook: None,
    post_body: Dict[str, Any],
    expected_status: int,
    index: int
) -> None:
    """Ensure RNA library assay, and analytes, and RNA properties validated on POST."""
    library_insert = get_item_from_search(es_testapp,'library', add_on="&analytes.molecule=RNA")
    identifying_post_body = {
        "submitted_id": f"TEST_LIBRARY_RNA-TEST{index}",
        "submission_centers":  item_utils.get_submission_centers(library_insert),
        **post_body
    }
    post_item(es_testapp, identifying_post_body, 'library', status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "post_body,expected_status,index", [
        ({"assay": "bulk_wgs", "analytes": ["TEST_ANALYTE_LIVER-DNA"]}, 201, 1), # DNA assay and analyte
        ({"assay": "bulk_rna_seq", "analytes": ["TEST_ANALYTE_LIVER-DNA"]}, 422, 2), #RNA assay and DNA analyte
    ]
)
def test_validate_dna_library_properties_on_post(
    es_testapp: TestApp,
    workbook: None,
    post_body: Dict[str, Any],
    expected_status: int,
    index: int
) -> None:
    """Ensure DNA library assay, and analytes, and DNA properties validated on POST."""
    library_insert = get_item_from_search(es_testapp,'library', add_on="&analytes.molecule=DNA")
    identifying_post_body = {
        "submitted_id": f"TEST_LIBRARY_DNA-TEST{index}",
        "submission_centers":  item_utils.get_submission_centers(library_insert),
        **post_body
    }
    post_item(es_testapp, identifying_post_body, 'library', status=expected_status)


def test_library_force_pass(
        testapp: TestApp,
        test_library: Dict[str, Any],
        test_rna_assay: Dict[str, Any]
    ) -> None:
    """ Tests that we can skip validation check by passing ?force_pass to patch invalid metadata to library."""
    atid = test_library['@id']
    testapp.patch_json(f'/{atid}', {'assay': 'bulk_rna_seq'}, status=422)  # fails without force_pass
    testapp.patch_json(f'/{atid}?force_pass', {'assay': 'bulk_rna_seq'}, status=200)