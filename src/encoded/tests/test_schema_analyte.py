from typing import Any, Dict

import pytest
from webtest import TestApp

from .utils import (
    patch_item,
    get_insert_identifier_for_item_type,
)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        ({"rna_integrity_number": 6}, 422),
        ({"rna_integrity_number_instrument": "Agilent Bioanalyzer"}, 422),
        (
            {
                "rna_integrity_number_instrument": "Agilent Bioanalyzer",
                "rna_integrity_number": 6,
            },
            200,
        ),
    ],
)
def test_rna_integrity_requirements(
    patch_body: Dict[str, Any],
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure mutual requirements for RIN and instrument."""
    uuid = get_insert_identifier_for_item_type(es_testapp, "Analyte")
    patch_item(
        es_testapp,
        patch_body,
        uuid,
        status=expected_status,
    )


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        ({"dna_integrity_number": 6}, 422),
        ({"dna_integrity_number_instrument": "Agilent 4200 TapeStation"}, 422),
        (
            {
                "dna_integrity_number": 6,
                "dna_integrity_number_instrument": "Agilent 4200 TapeStation",
            },
            200,
        ),
    ],
)
def test_dna_integrity_requirements(
    patch_body: Dict[str, Any],
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure mutual requirements for DIN and instrument."""
    uuid = get_insert_identifier_for_item_type(es_testapp, "Analyte")
    patch_item(
        es_testapp,
        patch_body,
        uuid,
        status=expected_status,
    )


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        ({"dna_quality_number": 6}, 422),
        ({"dna_quality_number_instrument": "Agilent 5400 Fragment Analyzer"}, 422),
        ({"dna_quality_size_threshold": 1000}, 422),
        (
            {
                "dna_quality_number": 6,
                "dna_quality_number_instrument": "Agilent 4200 TapeStation",
            },
            422,
        ),
        (
            {
                "dna_quality_number": 6,
                "dna_quality_size_threshold": 1000,
            },
            422,
        ),
        (
            {
                "dna_quality_number": 6,
                "dna_quality_size_threshold": 1000,
                "dna_quality_number_instrument": "Agilent 4200 TapeStation",
            },
            200,
        ),
    ],
)
def test_dna_quality_requirements(
    patch_body: Dict[str, Any],
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure mutual requirements for DQN, instrument, and threshold size."""
    uuid = get_insert_identifier_for_item_type(es_testapp, "Analyte")
    patch_item(
        es_testapp,
        patch_body,
        uuid,
        status=expected_status,
    )


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        ({"genomic_quality_number": 6}, 422),
        (
            {"genomic_quality_number_instrument": ["Agilent 5400 Fragment Analyzer"]},
            422,
        ),
        ({"genomic_quality_size_threshold": 1000}, 422),
        (
            {
                "genomic_quality_number": 6,
                "genomic_quality_number_instrument": ["Agilent 4200 TapeStation"],
            },
            422,
        ),
        (
            {
                "genomic_quality_number": 6,
                "genomic_quality_size_threshold": 1000,
            },
            422,
        ),
        (
            {
                "genomic_quality_number": 6,
                "genomic_quality_size_threshold": 1000,
                "genomic_quality_number_instrument": ["Agilent 4200 TapeStation"],
            },
            200,
        ),
    ],
)
def test_genome_quality_requirements(
    patch_body: Dict[str, Any],
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure mutual requirements for GQN, instrument, and threshold size."""
    uuid = get_insert_identifier_for_item_type(es_testapp, "Analyte")
    patch_item(
        es_testapp,
        patch_body,
        uuid,
        status=expected_status,
    )
