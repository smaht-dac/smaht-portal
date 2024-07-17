import pytest
from webtest.app import TestApp
from typing import Dict, Any

from .utils import get_insert_identifier_for_item_type, patch_item, get_item_from_search
from .test_permissions import post_item_then_delete, post_item_to_fail

@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"assay": "bulk_wgs", "analytes": ["TEST_ANALYTE_LIVER"]}, 200), # DNA assay and analyte
        ({"assay": "bulk_rna_seq", "analytes": ["TEST_ANALYTE_HELA"]}, 200), # RNA assay and analyte
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
    patch_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure library assay, and analytes, and RNA properties validated on PATCH."""
    identifier = get_insert_identifier_for_item_type(es_testapp,'library')
    patch_item(es_testapp, patch_body, identifier, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "post_body,expected_status", [
        ({"assay": "bulk_wgs", "analytes": ["TEST_ANALYTE_LIVER"]}, 200), # DNA assay and analyte
        ({"assay": "bulk_rna_seq", "analytes": ["TEST_ANALYTE_HELA"]}, 200), # RNA assay and analyte
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
def test_validate_library_properties_on_post(
    es_testapp: TestApp,
    post_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure library assay, and analytes, and RNA properties validated on POST."""
    library_insert = get_item_from_search(es_testapp,'library')
    identifying_post_body = {
        "submitted_id": 'TEST_LIBRARY_TEST',
        "submission_centers":  library_insert.get("submission_centers",[]),
        **post_body
    }
    if expected_status == 422:
        post_item_to_fail(es_testapp,"library",identifying_post_body)
    elif expected_status == 200:
        post_item_then_delete(es_testapp,es_testapp,"library",identifying_post_body)
