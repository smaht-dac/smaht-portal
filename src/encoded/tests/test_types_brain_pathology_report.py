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

_WORKBOOK_REPORT_ID = "TEST_BRAIN-PATHOLOGY-REPORT_SMHT001-3AJ-001S1"
_ITEM_TYPE = "brain_pathology_report"
_COLLECTION = "BrainPathologyReport"

# Stable valid brain subregion for use as a default in POST bodies
_VALID_BRAIN_SUBREGION = {
    "subregion": "Frontal Lobe Left Hemisphere",
    "is_present": "Yes",
    "tissue_autolysis_score": 1,
}

# Neuropathology field pair used across neuropathology_present tests
_NEUROPATH_PRESENT_FIELD = "inflammatory_neuropathology_present"
_NEUROPATH_DESCRIPTION_FIELD = "inflammatory_neuropathology_description"

# Base scalar fields included in every POST body.
# All *_present fields are set to "No" so no *_description is required.
_BASE_VALID_BRAIN_FIELDS: Dict[str, Any] = {
    _NEUROPATH_PRESENT_FIELD: "No",
    "additional_age-related_staining_performed": "No",
}


# ─────────────────────────────────────────────────────────────────────────────
# Fixture  (for non-workbook / force_pass tests only)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def test_brain_pathology_report(testapp: TestApp) -> Dict[str, Any]:
    """Create a minimal valid BrainPathologyReport for unit-style tests."""
    item = {
        "submitted_id": "TEST_BRAIN-PATH-REPORT_UNIT_001",
        "submission_centers": ["smaht"],
        "brain_subregions": [_VALID_BRAIN_SUBREGION],
        **_BASE_VALID_BRAIN_FIELDS,
    }
    return post_item(testapp, item, _ITEM_TYPE, status=201)


# ─────────────────────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────────────────────

def _build_post_body(
    insert: Dict[str, Any],
    suffix: str,
    **overrides,
) -> Dict[str, Any]:
    """
    Build a POST body for a new BrainPathologyReport.

    Derives submitted_id and submission_centers from a workbook insert and
    seeds every other field with a stable valid default.  Pass keyword
    arguments to override any field (including brain_subregions).
    """
    base: Dict[str, Any] = {
        "submitted_id": f"{insert['submitted_id']}_{suffix}",
        "submission_centers": insert.get("submission_centers", ["smaht"]),
        "brain_subregions": [_VALID_BRAIN_SUBREGION],
        **_BASE_VALID_BRAIN_FIELDS,
    }
    base.update(overrides)
    return base


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for brain pathology report with PathologyReport collection.
    """
    get_item(
        es_testapp, "TEST_BRAIN-PATHOLOGY-REPORT_SMHT001-3AJ-001S1", collection="PathologyReport",
        status=301
    )


# ─────────────────────────────────────────────────────────────────────────────
# Neuropathology Present / Description — edit
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        # Valid: present=No, no description required
        (
            {_NEUROPATH_PRESENT_FIELD: "No"},
            200,
        ),
        # Valid: present=Yes, description provided
        (
            {
                _NEUROPATH_PRESENT_FIELD: "Yes",
                _NEUROPATH_DESCRIPTION_FIELD: "Sclerosis confirmed by pathologist",
            },
            200,
        ),
        # Invalid: present=Yes, description absent
        (
            {_NEUROPATH_PRESENT_FIELD: "Yes"},
            422,
        ),
        # Invalid: present=Yes, description is whitespace-only
        (
            {
                _NEUROPATH_PRESENT_FIELD: "Yes",
                _NEUROPATH_DESCRIPTION_FIELD: "   ",
            },
            422,
        ),
    ],
)
def test_validate_neuropathology_present_on_edit(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
) -> None:
    """Ensure every *_present / *_description field pair is enforced on PATCH."""
    uuid = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)["uuid"]
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Neuropathology Present / Description — add
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "neuropath_fields,expected_status,index",
    [
        # Valid: present=No
        (
            {_NEUROPATH_PRESENT_FIELD: "No"},
            201,
            1,
        ),
        # Valid: present=Yes, description provided
        (
            {
                _NEUROPATH_PRESENT_FIELD: "Yes",
                _NEUROPATH_DESCRIPTION_FIELD: "Sclerosis confirmed by pathologist",
            },
            201,
            2,
        ),
        # Invalid: present=Yes, description absent
        (
            {_NEUROPATH_PRESENT_FIELD: "Yes"},
            422,
            3,
        ),
        # Invalid: present=Yes, description is whitespace-only
        (
            {
                _NEUROPATH_PRESENT_FIELD: "Yes",
                _NEUROPATH_DESCRIPTION_FIELD: "   ",
            },
            422,
            4,
        ),
    ],
)
def test_validate_neuropathology_present_on_add(
    es_testapp: TestApp,
    workbook: None,
    neuropath_fields: Dict[str, Any],
    expected_status: int,
    index: int,
) -> None:
    """Ensure every *_present / *_description field pair is enforced on POST."""
    insert = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)
    post_body = _build_post_body(insert, f"NP{index}", **neuropath_fields)
    post_item(es_testapp, post_body, _ITEM_TYPE, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Brain Subregions — edit
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        # Valid: is_present=Yes, autolysis_score provided
        (
            {
                "brain_subregions": [
                    {
                        "subregion": "Frontal Lobe Left Hemisphere",
                        "is_present": "Yes",
                        "tissue_autolysis_score": 1,
                    }
                ]
            },
            200,
        ),
        # Valid: is_present=No, autolysis_score absent
        (
            {
                "brain_subregions": [
                    {
                        "subregion": "Frontal Lobe Left Hemisphere",
                        "is_present": "No",
                    }
                ]
            },
            200,
        ),
        # Invalid: is_present=Yes, autolysis_score absent
        (
            {
                "brain_subregions": [
                    {
                        "subregion": "Frontal Lobe Left Hemisphere",
                        "is_present": "Yes",
                    }
                ]
            },
            422,
        ),
        # Invalid: is_present=No, autolysis_score provided
        (
            {
                "brain_subregions": [
                    {
                        "subregion": "Frontal Lobe Left Hemisphere",
                        "is_present": "No",
                        "tissue_autolysis_score": 1,
                    }
                ]
            },
            422,
        ),
    ],
)
def test_validate_brain_subregions_on_edit(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
) -> None:
    """Ensure brain_subregions conditional logic is enforced on PATCH."""
    uuid = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)["uuid"]
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Brain Subregions — add
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "subregion,expected_status,index",
    [
        # Valid: is_present=Yes, autolysis_score provided
        (
            {
                "subregion": "Frontal Lobe Left Hemisphere",
                "is_present": "Yes",
                "tissue_autolysis_score": 1,
            },
            201,
            1,
        ),
        # Valid: is_present=No, autolysis_score absent
        (
            {
                "subregion": "Frontal Lobe Left Hemisphere",
                "is_present": "No",
            },
            201,
            2,
        ),
        # Invalid: is_present=Yes, autolysis_score absent
        (
            {
                "subregion": "Frontal Lobe Left Hemisphere",
                "is_present": "Yes",
            },
            422,
            3,
        ),
        # Invalid: is_present=No, autolysis_score provided
        (
            {
                "subregion": "Frontal Lobe Left Hemisphere",
                "is_present": "No",
                "tissue_autolysis_score": 1,
            },
            422,
            4,
        ),
    ],
)
def test_validate_brain_subregions_on_add(
    es_testapp: TestApp,
    workbook: None,
    subregion: Dict[str, Any],
    expected_status: int,
    index: int,
) -> None:
    """Ensure brain_subregions conditional logic is enforced on POST."""
    insert = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)
    post_body = _build_post_body(insert, f"BS{index}", brain_subregions=[subregion])
    post_item(es_testapp, post_body, _ITEM_TYPE, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Age-Related Staining — edit
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        # Valid: staining_performed=No, no staining fields required
        (
            {"additional_age-related_staining_performed": "No"},
            200,
        ),
        # Valid: staining_performed=Yes, one staining field present
        (
            {
                "additional_age-related_staining_performed": "Yes",
                "abc_score_A": "A1",
            },
            200,
        ),
        # Valid: staining_performed=Yes, multiple staining fields present
        (
            {
                "additional_age-related_staining_performed": "Yes",
                "abc_score_A": "A1",
                "cerad_score": "C2",
                "braak_and_braak_ad": "IV",
            },
            200,
        ),
        # Invalid: staining_performed=Yes, no staining fields present
        (
            {"additional_age-related_staining_performed": "Yes"},
            422,
        ),
    ],
)
def test_validate_age_related_staining_on_edit(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
) -> None:
    """Ensure age-related staining conditional logic is enforced on PATCH."""
    uuid = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)["uuid"]
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Age-Related Staining — add
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
@pytest.mark.parametrize(
    "staining_fields,expected_status,index",
    [
        # Valid: staining_performed=No
        (
            {"additional_age-related_staining_performed": "No"},
            201,
            1,
        ),
        # Valid: staining_performed=Yes, one staining field present
        (
            {
                "additional_age-related_staining_performed": "Yes",
                "abc_score_A": "A1",
            },
            201,
            2,
        ),
        # Valid: staining_performed=Yes, multiple staining fields present
        (
            {
                "additional_age-related_staining_performed": "Yes",
                "thal": "Phase 2",
                "braak_pd": "Stage 3",
                "mckeith": "Brainstem predominant",
            },
            201,
            3,
        ),
        # Invalid: staining_performed=Yes, no staining fields present
        (
            {"additional_age-related_staining_performed": "Yes"},
            422,
            4,
        ),
    ],
)
def test_validate_age_related_staining_on_add(
    es_testapp: TestApp,
    workbook: None,
    staining_fields: Dict[str, Any],
    expected_status: int,
    index: int,
) -> None:
    """Ensure age-related staining conditional logic is enforced on POST."""
    insert = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)
    # _build_post_body seeds "additional_age-related_staining_performed": "No";
    # staining_fields overrides that value and adds any staining result fields.
    post_body = _build_post_body(insert, f"ARS{index}", **staining_fields)
    post_item(es_testapp, post_body, _ITEM_TYPE, status=expected_status)


# ─────────────────────────────────────────────────────────────────────────────
# Force-pass bypass
# ─────────────────────────────────────────────────────────────────────────────

def test_brain_pathology_report_force_pass(
    testapp: TestApp, test_brain_pathology_report: Dict[str, Any]
) -> None:
    """force_pass query parameter must bypass all BrainPathologyReport validators."""
    atid = test_brain_pathology_report["@id"]
    invalid_patch = {_NEUROPATH_PRESENT_FIELD: "Yes"}  # description deliberately absent
    testapp.patch_json(f"/{atid}", invalid_patch, status=422)
    testapp.patch_json(f"/{atid}?force_pass", invalid_patch, status=200)


# ─────────────────────────────────────────────────────────────────────────────
# Error message format
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.workbook
def test_brain_subregion_error_message_format(
    es_testapp: TestApp, workbook: None
) -> None:
    """Validation error for a missing tissue_autolysis_score has the expected location and name."""
    uuid = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)["uuid"]
    res = patch_item(
        es_testapp,
        {
            "brain_subregions": [
                {
                    "subregion": "Hippocampus Left Hemisphere",
                    "is_present": "Yes",
                    # tissue_autolysis_score deliberately absent
                }
            ]
        },
        uuid,
        status=422,
    )
    assert_validation_error_as_expected(
        res,
        location="body",
        name_start="BrainPathologyReport: invalid property",
    )


@pytest.mark.workbook
def test_age_related_staining_error_message_format(
    es_testapp: TestApp, workbook: None
) -> None:
    """Validation error when staining_performed=Yes with no staining fields has the expected format."""
    uuid = get_item(es_testapp, _WORKBOOK_REPORT_ID, collection=_COLLECTION)["uuid"]
    res = patch_item(
        es_testapp,
        {"additional_age-related_staining_performed": "Yes"},
        uuid,
        status=422,
    )
    assert_validation_error_as_expected(
        res,
        location="body",
        name_start="BrainPathologyReport: invalid property",
    )
