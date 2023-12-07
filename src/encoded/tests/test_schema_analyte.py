from typing import Any, Dict

import pytest
from webtest import TestApp

from .utils import patch_item


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
    ]
)
def test_rna_integrity_requirements(
    patch_body: Dict[str, Any], expected_status: int, es_testapp: TestApp, workbook: None
) -> None:
    """Ensure mutual requirements for RIN and instrument."""
    patch_item(
        es_testapp,
        patch_body,
        "3932c9d7-c5e6-46c3-9e67-2ccd276f4b74",
        status=expected_status,
    )
