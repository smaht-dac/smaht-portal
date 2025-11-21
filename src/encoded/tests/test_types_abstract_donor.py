from typing import Dict, Any
import pytest
from webtest import TestApp

from ..item_utils import (
    item as item_utils,
    donor as donor_utils,
)

from .utils import (
    get_item,
    patch_item,
    post_item,
)

@pytest.mark.workbook
@pytest.mark.parametrize(
    "submitted_id,expected", [
        ("TEST_DONOR_FEMALE", "Production"),
        ("TEST_DONOR_MALE", "Benchmarking"),
        ("TEST_DONOR_ALT1", ""),
        ("TEST_PROTECTED-DONOR_FEMALE", "Production"),
        ("TEST_PROTECTED-DONOR_MALE", "Benchmarking"),
    ]
)
def test_study_calc_prop(
    es_testapp: TestApp,
    workbook: None,
    submitted_id: str,
    expected: str
): 
    """Ensure 'study' calcprop is correct."""
    donor =get_item(
        es_testapp,
        submitted_id,
        collection="AbstractDonor"
    )
    assert donor.get("study","") == expected


@pytest.mark.workbook
@pytest.mark.parametrize(
    "submitted_id,patch_body,expected_status", [
        ("TEST_DONOR_MALE",{"external_id": "ST001","tpc_submitted": "True"}, 200),
        ("TEST_DONOR_MALE",{"external_id": "HG002","tpc_submitted": "True"}, 422),
        ("TEST_PROTECTED-DONOR_MALE",{"external_id": "ST001","tpc_submitted": "True"}, 200),
        ("TEST_PROTECTED-DONOR_MALE",{"external_id": "HG002","tpc_submitted": "True"}, 422),

    ]
)
def test_validate_external_id_on_edit(
    es_testapp: TestApp,
    workbook: None,
    submitted_id: str,
    patch_body: Dict[str, Any],
    expected_status: int
    ) -> None:
    """Ensure external_id validator works for TPC-submitted donors (both Donor and ProtectedDonor)."""
    uuid =  item_utils.get_uuid(
        get_item(
            es_testapp,
            submitted_id,
            collection="AbstractDonor"
        )
    )
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status,index", [
        ({"external_id": "ST001","tpc_submitted": "True"}, 201, 1),
        ({"external_id": "SMHT001","tpc_submitted": "True"}, 201, 2),
        ({"external_id": "SN001","tpc_submitted": "True"}, 201, 3),
        ({"external_id": "HG002","tpc_submitted": "False"}, 201, 4),
        ({"external_id": "HG002","tpc_submitted": "True"}, 422, 5),
    ]
)
def test_validate_external_id_on_add(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
    index: int
    ) -> None:
    """Ensure external_id validator works for TPC-submitted donors."""
    insert = get_item(
            es_testapp,
            "TEST_DONOR_MALE",
            collection="AbstractDonor"
        )
    post_body = {
        **patch_body,
        "submitted_id": f"{item_utils.get_submitted_id(insert)}_{index}",
        'submission_centers': item_utils.get_submission_centers(insert),
        'age': donor_utils.get_age(insert),
        'sex': donor_utils.get_sex(insert)
    }
    post_item(es_testapp, post_body, 'donor', status=expected_status)