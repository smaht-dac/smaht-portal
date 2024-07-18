import pytest
from webtest.app import TestApp
from typing import Dict, Any

from .utils import get_insert_identifier_for_item_type, patch_item, get_item_from_search
from .test_permissions import post_item_then_delete, post_item_to_fail

@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"molecule": ["RNA"],"molecule_detail": ["mRNA"]}, 200),
        ({"molecule": ['DNA'], "rna_integrity_number": 7, "rna_integrity_number_instrument": "Agilent Bioanalyzer"},422),
        ({"molecule": ['RNA'], "ribosomal_rna_ratio": 1.5}, 200),
        ({"molecule": ['RNA','DNA'], "ribosomal_rna_ratio": 1.5}, 200),
    ]
)
def test_validate_rna_molecule_properties_on_patch(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure analyte molecule RNA properties validated on PATCH."""
    identifier = get_insert_identifier_for_item_type(es_testapp,'analyte')
    patch_item(es_testapp, patch_body, identifier, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "post_body,expected_status", [
        ({"molecule": ["RNA"],"molecule_detail": ["mRNA"]}, 200),
        ({"molecule": ['DNA'],"molecule_detail": ["Total DNA"],"rna_integrity_number": 7, "rna_integrity_number_instrument": "Agilent Bioanalyzer"},422),
        ({"molecule": ['RNA'],"molecule_detail": ["mRNA"], "ribosomal_rna_ratio": 1.5}, 200),
        ({"molecule": ['RNA','DNA'],"molecule_detail": ["mRNA","Total DNA"], "ribosomal_rna_ratio": 1.5}, 200),
    ]
)
def test_validate_rna_molecule_properties_on_post(
    es_testapp: TestApp,
    workbook: None,
    post_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure analyte molecule RNA properties validated on POST."""
    analyte_insert = get_item_from_search(es_testapp,'analyte')
    identifying_post_body = {
        "submitted_id": 'TEST_ANALYTE_TEST',
        "submission_centers": analyte_insert.get("submission_centers",[]),
        "samples": analyte_insert.get("samples",[]),
        **post_body
    }
    if expected_status == 422:
        post_item_to_fail(es_testapp,"analyte",identifying_post_body)
    elif expected_status == 200:
        post_item_then_delete(es_testapp,es_testapp,"analyte",identifying_post_body)
