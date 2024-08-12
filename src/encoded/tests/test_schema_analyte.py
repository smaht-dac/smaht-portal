from typing import Any, Dict

import pytest
from webtest import TestApp

from .utils import (
    patch_item,
    get_item_from_search
)
from ..item_utils import (
    item as item_utils
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
    rna_uuid = item_utils.get_uuid(
        get_item_from_search(
            es_testapp,
            "Analyte",
            add_on="&molecule=RNA"
        )
    )
    patch_item(
        es_testapp,
        patch_body,
        rna_uuid,
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
    dna_uuid = item_utils.get_uuid(
        get_item_from_search(
            es_testapp,
            "Analyte",
            add_on="&molecule=DNA"
        )
    )
    patch_item(
        es_testapp,
        patch_body,
        dna_uuid,
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
    dna_uuid = item_utils.get_uuid(
        get_item_from_search(
            es_testapp,
            "Analyte",
            add_on="&molecule=DNA"
        )
    )
    patch_item(
        es_testapp,
        patch_body,
        dna_uuid,
        status=expected_status,
    )


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        ({"dna_genomic_quality_number": 6}, 422),
        (
            {"dna_genomic_quality_number_instrument": ["Agilent 5400 Fragment Analyzer"]},
            422,
        ),
        ({"dna_genomic_quality_size_threshold": 1000}, 422),
        (
            {
                "dna_genomic_quality_number": 6,
                "dna_genomic_quality_number_instrument": ["Agilent 4200 TapeStation"],
            },
            422,
        ),
        (
            {
                "dna_genomic_quality_number": 6,
                "dna_genomic_quality_size_threshold": 1000,
            },
            422,
        ),
        (
            {
                "dna_genomic_quality_number": 6,
                "dna_genomic_quality_size_threshold": 1000,
                "dna_genomic_quality_number_instrument": ["Agilent 4200 TapeStation"],
            },
            200,
        ),
    ],
)
def test_dna_genome_quality_requirements(
    patch_body: Dict[str, Any],
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure mutual requirements for GQN, instrument, and threshold size."""
    dna_uuid = item_utils.get_uuid(
        get_item_from_search(
            es_testapp,
            "Analyte",
            add_on="&molecule=DNA"
        )
    )
    patch_item(
        es_testapp,
        patch_body,
        dna_uuid,
        status=expected_status,
    )
