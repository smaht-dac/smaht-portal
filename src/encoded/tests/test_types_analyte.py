import pytest
from webtest.app import TestApp
from typing import Dict, Any

from .utils import get_insert_identifier_for_item_type, patch_item, get_item_from_search, post_item

from ..item_utils import (
    item as item_utils,
    analyte as analyte_utils
)

@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        (pytest.param({"molecule": ["RNA"],"molecule_detail": ["mRNA"]}, 200,id="first_test")),
        ({"molecule": ["RNA"],"molecule_detail": ["mRNA"],"dna_integrity_number_instrument": "Agilent 5400 Fragment Analyzer"}, 422),
        ({"molecule": ['DNA'],"molecule_detail": ["Total DNA"], "rna_integrity_number": 7, "rna_integrity_number_instrument": "Agilent Bioanalyzer"},422),
        ({"ribosomal_rna_ratio": 1.5}, 200),
        ({"molecule": ["DNA"]}, 422),
        ({"molecule": ['RNA','DNA'], "molecule_detail": ["mRNA","Total DNA"], "ribosomal_rna_ratio": 1.5}, 200),
        ({"molecule": ['RNA','DNA'], "molecule_detail": ["mRNA","Total DNA"], "dna_integrity_number": 5, "dna_integrity_number_instrument": "Agilent 5400 Fragment Analyzer"}, 200),
    ]
)
def test_validate_molecule_specific_properties_on_patch(
    request,
    es_testapp: TestApp,
    patch_body: Dict[str, Any],
    expected_status: int,
    workbook: None,
) -> None:
    """Ensure analyte molecule-specific properties validated on PATCH."""
    analyte_insert = get_item_from_search(es_testapp, 'analyte')
    identifying_post_body = {
        "uuid": "224ee404-5370-4313-a408-ee343ba17389",
        "submitted_id": "TEST_ANALYTE_TEST0",
        "submission_centers": item_utils.get_submission_centers(analyte_insert),
        "samples": analyte_utils.get_samples(analyte_insert),
        "molecule": ["DNA"],
        "molecule_detail": ["Total DNA"]
    }
    uuid = identifying_post_body["uuid"]
    if request.node.name == "test_validate_molecule_specific_properties_on_patch[first_test]":
        post_item(es_testapp, identifying_post_body, 'analyte') # If it's the first test, post item
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "post_body,expected_status,index", [
        ({"molecule": ["RNA"],"molecule_detail": ["mRNA"]}, 201,1),
        ({"molecule": ["RNA"],"molecule_detail": ["mRNA"],"dna_integrity_number_instrument": "Agilent 5400 Fragment Analyzer"}, 422,2),
        ({"molecule": ['DNA'],"molecule_detail": ["Total DNA"],"rna_integrity_number": 7, "rna_integrity_number_instrument": "Agilent Bioanalyzer"},422,3),
        ({"molecule": ['RNA'],"molecule_detail": ["mRNA"], "ribosomal_rna_ratio": 1.5}, 201,4),
        (
            {
                "molecule": ['RNA','DNA'],
                "molecule_detail": ["mRNA","Total DNA"],
                "ribosomal_rna_ratio": 1.5
            }, 201,5
        ),
        (
            {
                "molecule": ['RNA','DNA'],
                "molecule_detail": ["mRNA","Total DNA"],
                "dna_integrity_number": 6,
                "dna_integrity_number_instrument":"Agilent 5400 Fragment Analyzer"
            }, 201,6
        ),
    ]
)
def test_validate_molecule_specific_on_post(
    es_testapp: TestApp,
    workbook: None,
    post_body: Dict[str, Any],
    expected_status: int,
    index: int
) -> None:
    """Ensure analyte molecule-specific properties validated on POST."""
    analyte_insert = get_item_from_search(es_testapp, 'analyte')
    identifying_post_body = {
        "submitted_id": f"TEST_ANALYTE_TEST{index}",
        "submission_centers": item_utils.get_submission_centers(analyte_insert),
        "samples": analyte_utils.get_samples(analyte_insert),
        **post_body
    }
    post_item(es_testapp, identifying_post_body, 'analyte', status=expected_status)