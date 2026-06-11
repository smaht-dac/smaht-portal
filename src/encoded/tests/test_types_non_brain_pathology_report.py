from typing import Dict, Any

import pytest
from webtest import TestApp

from .utils import (
    get_item,
    patch_item,
    post_item,
    assert_validation_error_as_expected,
)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

_WORKBOOK_REPORT_ID = "TEST_NON-BRAIN-PATHOLOGY-REPORT_SMHT001-1A-100A1"
_ITEM_TYPE = "non_brain_pathology_report"
_COLLECTION = "NonBrainPathologyReport"

# Stable valid objects used as defaults when building POST bodies
_VALID_TARGET_TISSUE = {
    "target_tissue_subtype": "Liver",
    "target_tissue_present": "Yes",
    "target_tissue_percentage": "[50-100]",
    "target_tissue_autolysis_score": 1,
}
_VALID_NON_TARGET_TISSUE = {
    "non_target_tissue_subtype": "Fibroadipose",
    "non_target_tissue_present": "No",
}
_VALID_PATHOLOGIC_FINDING = {
    "finding_type": "Inflammation",
    "finding_present": "No",
}


# ─────────────────────────────────────────────────────────────────────────────
# Fixture  (for non-workbook / force_pass tests only)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def test_non_brain_pathology_report(testapp: TestApp) -> Dict[str, Any]:
    """Create a minimal valid NonBrainPathologyReport for unit-style tests."""
    item = {
        "submitted_id": "TEST_NON-BRAIN-PATH-REPORT_UNIT_001",
        "submission_centers": ["smaht"],
        "target_tissues": [_VALID_TARGET_TISSUE],
        "non_target_tissues": [_VALID_NON_TARGET_TISSUE],
        "pathologic_findings": [_VALID_PATHOLOGIC_FINDING],
    }
    return post_item(testapp, item, _ITEM_TYPE, status=201)


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for non-brain pathology report with PathologyReport collection.
    """
    get_item(
        es_testapp, "TEST_NON-BRAIN-PATHOLOGY-REPORT_SMHT001-1A-100A1", collection="PathologyReport",
        status=301
    )


# ─────────────────────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────────────────────

def _build_post_body(
    insert: Dict[str, Any],
    suffix: str,
    **array_overrides,
) -> Dict[str, Any]:
    """
    Build a POST body for a new NonBrainPathologyReport.

    Derives submitted_id and submission_centers from a workbook insert.
    Each of the three array fields defaults to a stable valid value;
    pass the field name as a keyword argument to override it.
    """
    return {
        "submitted_id": f"{insert['submitted_id']}_{suffix}",
        "submission_centers": insert.get("submission_centers", ["smaht"]),
        "target_tissues": array_overrides.get("target_tissues", [_VALID_TARGET_TISSUE]),
        "non_target_tissues": array_overrides.get(
            "non_target_tissues", [_VALID_NON_TARGET_TISSUE]
        ),
        "pathologic_findings": array_overrides.get(
            "pathologic_findings", [_VALID_PATHOLOGIC_FINDING]
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Target Tissues — edit
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        # Valid: present=Yes, non-zero percentage, autolysis_score provided
        (
            {
                "target_tissues": [
                    {
                        "target_tissue_subtype": "Liver",
                        "target_tissue_present": "Yes",
                        "target_tissue_percentage": "[50-100]",
                        "target_tissue_autolysis_score": 1,
                    }
                ]
            },
            200,
        ),
        # Valid: present=No, percentage="0", autolysis_score absent
        (
            {
                "target_tissues": [
                    {
                        "target_tissue_subtype": "Liver",
                        "target_tissue_present": "No",
                        "target_tissue_percentage": "0",
                    }
                ]
            },
            200,
        ),
        # Invalid: present=No, percentage is non-zero
        (
            {
                "target_tissues": [
                    {
                        "target_tissue_subtype": "Liver",
                        "target_tissue_present": "No",
                        "target_tissue_percentage": "30",
                    }
                ]
            },
            422,
        ),
        # Invalid: present=No, autolysis_score provided
        (
            {
                "target_tissues": [
                    {
                        "target_tissue_subtype": "Liver",
                        "target_tissue_present": "No",
                        "target_tissue_percentage": "0",
                        "target_tissue_autolysis_score": 1,
                    }
                ]
            },
            422,
        ),
        # Invalid: present=Yes, percentage is "0"
        (
            {
                "target_tissues": [
                    {
                        "target_tissue_subtype": "Liver",
                        "target_tissue_present": "Yes",
                        "target_tissue_percentage": "0",
                        "target_tissue_autolysis_score": 1,
                    }
                ]
            },
            422,
        ),
        # Invalid: present=Yes, autolysis_score absent
        (
            {
                "target_tissues": [
                    {
                        "target_tissue_subtype": "Liver",
                        "target_tissue_present": "Yes",
                        "target_tissue_percentage": "[50-100]",
                    }
                ]
            },
            422,
        ),
        # Invalid: present=Yes, percentage absent
        (
            {
                "target_tissues": [
                    {
                        "target_tissue_subtype": "Liver",
                        "target_tissue_present": "Yes",
                        "target_tissue_autolysis_score": 1,
                    }
                ]
            },
            422,
        ),
    ],
)
def test_validate_target_tissues_on_edit(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
) -> None:
    """Ensure target_tissues conditional logic is enforced on PATCH."""
    uuid = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)["uuid"]
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Target Tissues — add
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "target_tissue,expected_status,index",
    [
        # Valid: present=Yes
        (
            {
                "target_tissue_subtype": "Liver",
                "target_tissue_present": "Yes",
                "target_tissue_percentage": "[50-100]",
                "target_tissue_autolysis_score": 1,
            },
            201,
            1,
        ),
        # Valid: present=No, percentage="0"
        (
            {
                "target_tissue_subtype": "Liver",
                "target_tissue_present": "No",
                "target_tissue_percentage": "0",
            },
            201,
            2,
        ),
        # Invalid: present=No, percentage not "0"
        (
            {
                "target_tissue_subtype": "Liver",
                "target_tissue_present": "No",
                "target_tissue_percentage": "30",
            },
            422,
            3,
        ),
        # Invalid: present=No, autolysis_score provided
        (
            {
                "target_tissue_subtype": "Liver",
                "target_tissue_present": "No",
                "target_tissue_percentage": "0",
                "target_tissue_autolysis_score": 1,
            },
            422,
            4,
        ),
        # Invalid: present=Yes, percentage is "0"
        (
            {
                "target_tissue_subtype": "Liver",
                "target_tissue_present": "Yes",
                "target_tissue_percentage": "0",
                "target_tissue_autolysis_score": 1,
            },
            422,
            5,
        ),
        # Invalid: present=Yes, autolysis_score absent
        (
            {
                "target_tissue_subtype": "Liver",
                "target_tissue_present": "Yes",
                "target_tissue_percentage": "[50-100]",
            },
            422,
            6,
        ),
        # Invalid: present=Yes, percentage absent
        (
            {
                "target_tissue_subtype": "Liver",
                "target_tissue_present": "Yes",
                "target_tissue_autolysis_score": 1,
            },
            422,
            7,
        ),
    ],
)
def test_validate_target_tissues_on_add(
    es_testapp: TestApp,
    workbook: None,
    target_tissue: Dict[str, Any],
    expected_status: int,
    index: int,
) -> None:
    """Ensure target_tissues conditional logic is enforced on POST."""
    insert = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)
    post_body = _build_post_body(insert, f"TT{index}", target_tissues=[target_tissue])
    post_item(es_testapp, post_body, _ITEM_TYPE, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Non-Target Tissues — edit
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        # Valid: present=Yes, percentage provided
        (
            {
                "non_target_tissues": [
                    {
                        "non_target_tissue_subtype": "Fibroadipose",
                        "non_target_tissue_present": "Yes",
                        "non_target_tissue_percentage": "[11-25]",
                    }
                ]
            },
            200,
        ),
        # Valid: present=No, no percentage
        (
            {
                "non_target_tissues": [
                    {
                        "non_target_tissue_subtype": "Fibroadipose",
                        "non_target_tissue_present": "No",
                    }
                ]
            },
            200,
        ),
        # Invalid: present=Yes, percentage absent
        (
            {
                "non_target_tissues": [
                    {
                        "non_target_tissue_subtype": "Fibroadipose",
                        "non_target_tissue_present": "Yes",
                    }
                ]
            },
            422,
        ),
        # Invalid: present=No, percentage provided
        (
            {
                "non_target_tissues": [
                    {
                        "non_target_tissue_subtype": "Fibroadipose",
                        "non_target_tissue_present": "No",
                        "non_target_tissue_percentage": "[11-25]",
                    }
                ]
            },
            422,
        ),
    ],
)
def test_validate_non_target_tissues_on_edit(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
) -> None:
    """Ensure non_target_tissues conditional logic is enforced on PATCH."""
    uuid = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)["uuid"]
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Non-Target Tissues — add
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "non_target_tissue,expected_status,index",
    [
        # Valid: present=Yes, percentage provided
        (
            {
                "non_target_tissue_subtype": "Fibroadipose",
                "non_target_tissue_present": "Yes",
                "non_target_tissue_percentage": "[11-25]",
            },
            201,
            1,
        ),
        # Valid: present=No, no percentage
        (
            {
                "non_target_tissue_subtype": "Fibroadipose",
                "non_target_tissue_present": "No",
            },
            201,
            2,
        ),
        # Invalid: present=Yes, percentage absent
        (
            {
                "non_target_tissue_subtype": "Fibroadipose",
                "non_target_tissue_present": "Yes",
            },
            422,
            3,
        ),
        # Invalid: present=No, percentage provided
        (
            {
                "non_target_tissue_subtype": "Fibroadipose",
                "non_target_tissue_present": "No",
                "non_target_tissue_percentage": "[11-25]",
            },
            422,
            4,
        ),
    ],
)
def test_validate_non_target_tissues_on_add(
    es_testapp: TestApp,
    workbook: None,
    non_target_tissue: Dict[str, Any],
    expected_status: int,
    index: int,
) -> None:
    """Ensure non_target_tissues conditional logic is enforced on POST."""
    insert = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)
    post_body = _build_post_body(
        insert, f"NTT{index}", non_target_tissues=[non_target_tissue]
    )
    post_item(es_testapp, post_body, _ITEM_TYPE, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Pathologic Findings — edit
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        # Valid: present=Yes, both description and percentage provided
        (
            {
                "pathologic_findings": [
                    {
                        "finding_type": "Inflammation",
                        "finding_present": "Yes",
                        "finding_description": "Mild lymphocytic infiltrate",
                        "finding_percentage": "[0-10]",
                    }
                ]
            },
            200,
        ),
        # Valid: present=Yes, only description provided
        (
            {
                "pathologic_findings": [
                    {
                        "finding_type": "Inflammation",
                        "finding_present": "Yes",
                        "finding_description": "Mild lymphocytic infiltrate",
                    }
                ]
            },
            200,
        ),
        # Valid: present=Yes, only percentage provided
        (
            {
                "pathologic_findings": [
                    {
                        "finding_type": "Inflammation",
                        "finding_present": "Yes",
                        "finding_percentage": "[0-10]",
                    }
                ]
            },
            200,
        ),
        # Valid: present=No, no percentage
        (
            {
                "pathologic_findings": [
                    {
                        "finding_type": "Inflammation",
                        "finding_present": "No",
                    }
                ]
            },
            200,
        ),
        # Invalid: present=Yes, neither description nor percentage
        (
            {
                "pathologic_findings": [
                    {
                        "finding_type": "Inflammation",
                        "finding_present": "Yes",
                    }
                ]
            },
            422,
        ),
        # Invalid: present=Yes, description is whitespace-only and no percentage
        (
            {
                "pathologic_findings": [
                    {
                        "finding_type": "Inflammation",
                        "finding_present": "Yes",
                        "finding_description": "   ",
                    }
                ]
            },
            422,
        ),
        # Invalid: present=No, percentage provided
        (
            {
                "pathologic_findings": [
                    {
                        "finding_type": "Inflammation",
                        "finding_present": "No",
                        "finding_percentage": "[0-10]",
                    }
                ]
            },
            422,
        ),
    ],
)
def test_validate_pathologic_findings_on_edit(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
) -> None:
    """Ensure pathologic_findings conditional logic is enforced on PATCH."""
    uuid = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)["uuid"]
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Pathologic Findings — add
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "finding,expected_status,index",
    [
        # Valid: present=Yes, both fields provided
        (
            {
                "finding_type": "Inflammation",
                "finding_present": "Yes",
                "finding_description": "Mild lymphocytic infiltrate",
                "finding_percentage": "[0-10]",
            },
            201,
            1,
        ),
        # Valid: present=Yes, only description provided
        (
            {
                "finding_type": "Inflammation",
                "finding_present": "Yes",
                "finding_description": "Mild lymphocytic infiltrate",
            },
            201,
            2,
        ),
        # Valid: present=Yes, only percentage provided
        (
            {
                "finding_type": "Inflammation",
                "finding_present": "Yes",
                "finding_percentage": "[0-10]",
            },
            201,
            3,
        ),
        # Valid: present=No
        (
            {
                "finding_type": "Inflammation",
                "finding_present": "No",
            },
            201,
            4,
        ),
        # Invalid: present=Yes, neither description nor percentage
        (
            {
                "finding_type": "Inflammation",
                "finding_present": "Yes",
            },
            422,
            5,
        ),
        # Invalid: present=Yes, description is empty string and no percentage
        (
            {
                "finding_type": "Inflammation",
                "finding_present": "Yes",
                "finding_description": "",
            },
            422,
            6,
        ),
        # Invalid: present=No, percentage provided
        (
            {
                "finding_type": "Inflammation",
                "finding_present": "No",
                "finding_percentage": "[0-10]",
            },
            422,
            7,
        ),
    ],
)
def test_validate_pathologic_findings_on_add(
    es_testapp: TestApp,
    workbook: None,
    finding: Dict[str, Any],
    expected_status: int,
    index: int,
) -> None:
    """Ensure pathologic_findings conditional logic is enforced on POST."""
    insert = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)
    post_body = _build_post_body(insert, f"PF{index}", pathologic_findings=[finding])
    post_item(es_testapp, post_body, _ITEM_TYPE, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Force-pass bypass
# ─────────────────────────────────────────────────────────────────────────────

def test_non_brain_pathology_report_force_pass(
    testapp: TestApp, test_non_brain_pathology_report: Dict[str, Any]
) -> None:
    """force_pass query parameter must bypass all NonBrainPathologyReport validators."""
    atid = test_non_brain_pathology_report["@id"]
    invalid_patch = {
        "target_tissues": [
            {
                "target_tissue_subtype": "Liver",
                "target_tissue_present": "No",
                "target_tissue_percentage": "30",  # invalid: must be "0" when present=No
            }
        ]
    }
    testapp.patch_json(f"/{atid}", invalid_patch, status=422)
    testapp.patch_json(f"/{atid}?force_pass", invalid_patch, status=200)


# ─────────────────────────────────────────────────────────────────────────────
# Error message format
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
def test_target_tissue_error_message_format(
    es_testapp: TestApp, workbook: None
) -> None:
    """Validation error for an invalid target_tissue has the expected location and name."""
    uuid = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)["uuid"]
    res = patch_item(
        es_testapp,
        {
            "target_tissues": [
                {
                    "target_tissue_subtype": "Liver",
                    "target_tissue_present": "No",
                    "target_tissue_percentage": "30",
                }
            ]
        },
        uuid,
        status=422,
    )
    assert_validation_error_as_expected(
        res,
        location="body",
        name_start="NonBrainPathologyReport: invalid property",
    )


@pytest.mark.workbook
def test_pathologic_finding_error_message_format(
    es_testapp: TestApp, workbook: None
) -> None:
    """Validation error when finding_present=Yes with neither field has expected format."""
    uuid = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)["uuid"]
    res = patch_item(
        es_testapp,
        {
            "pathologic_findings": [
                {
                    "finding_type": "Fibrosis",
                    "finding_present": "Yes",
                    # both finding_description and finding_percentage deliberately absent
                }
            ]
        },
        uuid,
        status=422,
    )
    assert_validation_error_as_expected(
        res,
        location="body",
        name_start="NonBrainPathologyReport: invalid property",
    )
