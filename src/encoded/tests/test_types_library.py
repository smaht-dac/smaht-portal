import pytest
from webtest.app import TestApp
from typing import Dict, Any

from .utils import get_insert_identifier_for_item_type, patch_item, get_item_from_search, post_item

from ..item_utils import item as item_utils


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"assay": "bulk_wgs", "analytes": ["TEST_ANALYTE_LIVER"]}, 200), # DNA assay and analyte
        ({"assay": "bulk_rna_seq", "analytes": ["TEST_ANALYTE_HELA"]}, 200), # RNA assay and analyte
        ({"analytes": ["TEST_ANALYTE_LIVER"]}, 422), #RNA assay and DNA analyte patch
        ({"assay": "bulk_fiberseq"}, 422), #RNA assay and DNA analyte patch
        ({"assay": "bulk_rna_seq", "analytes": ["TEST_ANALYTE_LIVER"]}, 422), #RNA assay and DNA analyte
        ({"assay": "bulk_fiberseq", "analytes": ["TEST_ANALYTE_HELA"]}, 422), #DNA assay and RNA analyte
        (
            {
                "assay": "bulk_rna_seq",
                "analytes": ["TEST_ANALYTE_HELA"],
                "concatenated_reads": "Yes",
                "target_monomer_size": 10000
            }, 422
        ), #MAS ISO-Seq properties and incompatible assay
        (
            {
                "assay": "bulk_mas_iso_seq",
                "analytes": ["TEST_ANALYTE_HELA"],
                "concatenated_reads": "Yes",
                "target_monomer_size": 10000
            }, 200 #MAS ISO-Seq properties and compatible assay
        ),
    ]
)
def test_validate_library_properties_on_patch(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure library assay, and analytes, and RNA properties validated on PATCH."""
    identifier = get_insert_identifier_for_item_type(es_testapp, 'library')
    patch_item(es_testapp, patch_body, identifier, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "post_body,expected_status,index", [
        ({"assay": "bulk_wgs", "analytes": ["TEST_ANALYTE_LIVER"]}, 201, 1), # DNA assay and analyte
        ({"assay": "bulk_rna_seq", "analytes": ["TEST_ANALYTE_HELA"]}, 201, 2), # RNA assay and analyte
        ({"assay": "bulk_rna_seq", "analytes": ["TEST_ANALYTE_LIVER"]}, 422, 3), #RNA assay and DNA analyte
        ({"assay": "bulk_fiberseq", "analytes": ["TEST_ANALYTE_HELA"]}, 422, 4), #DNA assay and RNA analyte
        (
            {
                "assay": "bulk_rna_seq",
                "analytes": ["TEST_ANALYTE_HELA"],
                "concatenated_reads": "Yes",
                "target_monomer_size": 10000
            }, 422, 5
        ), #MAS ISO-Seq properties and incompatible assay
        (
            {
                "assay": "bulk_mas_iso_seq",
                "analytes": ["TEST_ANALYTE_HELA"],
                "concatenated_reads": "Yes",
                "target_monomer_size": 10000
            }, 201, 6 #MAS ISO-Seq properties and compatible assay
        ),
    ]
)
def test_validate_library_properties_on_post(
    es_testapp: TestApp,
    workbook: None,
    post_body: Dict[str, Any],
    expected_status: int,
    index: int
) -> None:
    """Ensure library assay, and analytes, and RNA properties validated on POST."""
    library_insert = get_item_from_search(es_testapp,'library')
    identifying_post_body = {
        "submitted_id": f"TEST_LIBRARY_TEST{index}",
        "submission_centers":  item_utils.get_submission_centers(library_insert),
        **post_body
    }
    post_item(es_testapp, identifying_post_body, 'library', status=expected_status)


