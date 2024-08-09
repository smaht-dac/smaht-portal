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
        ({"molecule": ["RNA"],"molecule_detail": ["mRNA"]}, 200),
        ({"molecule": ["RNA"],"molecule_detail": ["mRNA"],"dna_integrity_number_instrument": "Agilent 5400 Fragment Analyzer"}, 422),
        ({"molecule": ['DNA'],"molecule_detail": ["Total DNA"], "rna_integrity_number": 7, "rna_integrity_number_instrument": "Agilent Bioanalyzer"},422),
        ({"molecule": ['RNA'], "ribosomal_rna_ratio": 1.5}, 200),
        ({"molecule": ['RNA','DNA'], "molecule_detail": ["mRNA","Total DNA"], "ribosomal_rna_ratio": 1.5}, 200),
        ({"molecule": ['RNA','DNA'], "molecule_detail": ["mRNA","Total DNA"], "dna_integrity_number": 5, "dna_integrity_number_instrument": "Agilent 5400 Fragment Analyzer"}, 200),
    ]
)
def test_validate_molecule_specific_properties_on_patch(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure analyte molecule-specific properties validated on PATCH."""
    identifier = get_insert_identifier_for_item_type(es_testapp, 'analyte')
    patch_item(es_testapp, patch_body, identifier, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "post_body,expected_status,index", [
        ({"molecule": ["RNA"],"molecule_detail": ["mRNA"]}, 201,1),
        ({"molecule": ["RNA"],"molecule_detail": ["mRNA"],"dna_integrity_number_instrument": "Agilent 5400 Fragment Analyzer"}, 422,1),
        ({"molecule": ['DNA'],"molecule_detail": ["Total DNA"],"rna_integrity_number": 7, "rna_integrity_number_instrument": "Agilent Bioanalyzer"},422,1),
        ({"molecule": ['RNA'],"molecule_detail": ["mRNA"], "ribosomal_rna_ratio": 1.5}, 201,2),
        ({"molecule": ['RNA','DNA'],"molecule_detail": ["mRNA","Total DNA"], "ribosomal_rna_ratio": 1.5}, 201,3),
        ({"molecule": ['RNA','DNA'], "molecule_detail": ["mRNA","Total DNA"], "dna_integrity_number": 5, "dna_integrity_number_instrument": "Agilent 5400 Fragment Analyzer"}, 201,4),
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
