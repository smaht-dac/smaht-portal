import re
from typing import Any, Dict, List

import pytest
from dcicutils import schema_utils
from snovault.typeinfo import TypeInfo
from webtest.app import TestApp

from .datafixtures import TEST_SUBMISSION_CENTER_CODE
from .utils import (
    get_schema, get_submitted_item_types, patch_item, post_item
)


"""
The `submitted_id` property should be present in all schemas for submitted
items. Its pattern is dependent on the item type but follows an overall format
which is checked in this module's tests.

The overall format is:
    <submission center code><separator><item type code><separator><identifier>
with the elements as follows:
    - submission center code: SubmissionCenter `submitted_id_code`
    - separator: character to separate the 3 elements
        * To facilitate parsing for validation, this character cannot be
          present in the submission center code or the item type code
    - item type code: string to prevent cross-item references
    - identifier: submitted identifier of submitters' choosing
"""
EXPECTED_SUBMITTED_ID_CENTER_CODE_PATTERN = r"\[A-Z-\]\{4,\}"
EXPECTED_SUBMITTED_ID_IDENTIFIER_PATTERN = r"\[A-Z0-9-\.\]\{4,\}"
SUBMITTED_ID_SEPARATOR = "_"
EXPECTED_SUBMITTED_ID_PATTERN_FORMAT = re.compile(
    rf"^[\^]{EXPECTED_SUBMITTED_ID_CENTER_CODE_PATTERN}"
    rf"[{SUBMITTED_ID_SEPARATOR}][A-Z-]+[{SUBMITTED_ID_SEPARATOR}]"
    rf"{EXPECTED_SUBMITTED_ID_IDENTIFIER_PATTERN}[\$]$"
)

VALID_CELL_LINE_SUBMITTED_ID = (
    f"{TEST_SUBMISSION_CENTER_CODE}_CELL-LINE_SOME-IDENTIFIER"
)


@pytest.fixture
def cell_line_properties(
    testapp: TestApp, test_submission_center: Dict[str, Any]
) -> Dict[str, Any]:
    return {
        "submission_centers": [test_submission_center["uuid"]],
        "source": "A moldy basement",
        "title": "Best Cell Line",
    }


@pytest.fixture
def cell_line(testapp: TestApp, cell_line_properties: Dict[str, Any]) -> Dict[str, Any]:
    properties = {**cell_line_properties, "submitted_id": VALID_CELL_LINE_SUBMITTED_ID}
    return post_item(testapp, properties, "CellLine", status=201)


@pytest.mark.parametrize(
    "submitted_id,expected_status",
    [
        ("", 422),
        ("SOME-CODE_NOT-CELL-LINE_SOME-IDENTIFIER", 422),
        ("SOME-CODE_CELL-LINE_SOME-IDENTIFIER", 422),
        (VALID_CELL_LINE_SUBMITTED_ID, 201),
    ],
)
def test_submitted_id_validation_on_post(
    submitted_id: str,
    expected_status: int,
    testapp: TestApp,
    cell_line_properties: Dict[str, Any],
) -> None:
    properties = {**cell_line_properties, "submitted_id": submitted_id}
    post_item(testapp, properties, "CellLine", status=expected_status)


@pytest.mark.parametrize(
    "submitted_id,expected_status",
    [
        ("", 422),
        ("SOME-CODE_NOT-CELL-LINE_SOME-IDENTIFIER", 422),
        ("SOME-CODE_CELL-LINE_SOME-IDENTIFIER", 422),
        (VALID_CELL_LINE_SUBMITTED_ID, 200),
    ],
)
def test_submitted_id_validation_on_patch(
    submitted_id: str,
    expected_status: int,
    testapp: TestApp,
    cell_line: Dict[str, Any],
) -> None:
    patch_body = {"submitted_id": submitted_id}
    patch_item(testapp, patch_body, cell_line["uuid"], status=expected_status)


def test_submitted_id_code_pattern(testapp: TestApp) -> None:
    """Ensure SubmissionCenter submitter_id_code pattern as expected.

    First portion of the submitted_id corresponds to the submitted_id_code of
    SubmissionCenter, so these need to be synced.
    """
    submitted_id_code_pattern = get_submitted_id_code_pattern(testapp)
    assert submitted_id_code_pattern == (
        f"^{EXPECTED_SUBMITTED_ID_CENTER_CODE_PATTERN}$"
    )


def get_submitted_id_code_pattern(testapp: TestApp) -> str:
    """Get SubmissionCenter submitted_id_code pattern."""
    submission_center_schema = get_schema(testapp, "submission_center")
    submitted_id_code = schema_utils.get_property(
        submission_center_schema, "submitted_id_code"
    )
    return schema_utils.get_pattern(submitted_id_code)


def test_submitted_id_patterns(testapp: TestApp) -> None:
    """Ensure submitted_id regex patterns as expected.

    Expectations are:
        - Pattern present
        - Submission center code pattern uniformly applied
        - Item type code matches item name or known exception
        - Identifying code pattern uniformly applied
    """
    pattern_failures = get_submitted_id_pattern_failures(testapp)
    assert not pattern_failures, (
        f"Issues found for submitted_id patterns: {pattern_failures}"
    )


def get_submitted_id_pattern_failures(testapp: TestApp) -> List[str]:
    """Get failure messages for submitted_id patterns."""
    result = []
    submitted_items = get_submitted_item_types(testapp)
    for item_name, type_info in submitted_items.items():
        pattern_failure = get_submitted_id_pattern_failure(item_name, type_info)
        if pattern_failure:
            result.append(pattern_failure)
    return result


def get_submitted_id_pattern_failure(
    item_name: str, type_info: TypeInfo
) -> str:
    """Report submitted_id pattern issues, if present."""
    pattern_issues = get_submitted_id_pattern_issues(type_info)
    if pattern_issues:
        return f"{item_name}: {pattern_issues}"
    return ""


def get_submitted_id_pattern(type_info: TypeInfo) -> str:
    """Get schema regex pattern for submitted_id."""
    submitted_id = schema_utils.get_property(type_info.schema, "submitted_id")
    return schema_utils.get_pattern(submitted_id)


def split_submitted_id_pattern(submitted_id_pattern: str) -> str:
    """Split submitted_id pattern into components via separator."""
    return submitted_id_pattern.split(SUBMITTED_ID_SEPARATOR)


def get_center_code_pattern_from_submitted_id_pattern(
    submitted_id_pattern: str
) -> str:
    """Return portion of submitted_id pattern for SubmissionCenter code."""
    return split_submitted_id_pattern(submitted_id_pattern)[0]


def get_item_type_from_submitted_id_pattern(submitted_id_pattern: str) -> str:
    """Return portion of submitted_id pattern for item type."""
    split_pattern = split_submitted_id_pattern(submitted_id_pattern)
    if len(split_pattern) >= 2:
        return split_pattern[1]
    return ""


def get_identifier_pattern_from_submitted_id_pattern(
    submitted_id_pattern: str
) -> str:
    """Return portion of submitted_id pattern for submitted idenifier."""
    split_pattern = split_submitted_id_pattern(submitted_id_pattern)
    if len(split_pattern) >= 3:
        return "".join(split_pattern[2:])
    return ""


def get_submitted_id_pattern_issues(type_info: TypeInfo) -> List[str]:
    """Gather all submitted_id pattern problems."""
    pattern = get_submitted_id_pattern(type_info)
    failure_checks = [
        get_submitted_id_pattern_format_failure(pattern),
        get_submitted_id_pattern_item_type_failure(pattern, type_info),
    ]
    return [check for check in failure_checks if check]


def get_submitted_id_pattern_format_failure(pattern: str) -> str:
    """Check pattern overall format.

    Using a regex to check a regex here, so formatting is a little
    tricky to get right, particularly which characters to escape.
    """
    match = EXPECTED_SUBMITTED_ID_PATTERN_FORMAT.match(pattern)
    if not match:
        return (
            f"Pattern {pattern} failed to match expected format"
            f" {EXPECTED_SUBMITTED_ID_PATTERN_FORMAT}."
        )
    return ""


# def get_submitted_id_pattern_center_code_failure(pattern: str) -> str:
#     """Check submission code pattern and report issue, if found."""
#     center_code_pattern = get_center_code_pattern_from_submitted_id_pattern(
#         pattern
#     )
#     if center_code_pattern != f"^{EXPECTED_SUBMITTED_ID_CENTER_CODE_PATTERN}":
#         return (
#             f"Unexpected pattern for SubmissionCenter code: {center_code_pattern}."
#             f" Expected {EXPECTED_SUBMITTED_ID_CENTER_CODE_PATTERN}"
#         )
#     return ""


def get_submitted_id_pattern_item_type_failure(
    pattern: str, type_info: TypeInfo
) -> str:
    """Check item pattern and report issue, if found."""
    item_type = get_item_type_from_submitted_id_pattern(pattern)
    expected_item_type = type_info.item_type.upper().replace("_", "-")
    if item_type != expected_item_type:
        return (
            f"Unexpected item type in pattern: {item_type}."
            f" Expected {expected_item_type}"
        )
    return ""


# def get_submitted_id_pattern_identifier_failure(pattern: str) -> str:
#     """Check identifer failure and report issue, if found."""
#     identifier_pattern = get_identifier_pattern_from_submitted_id_pattern(pattern)
#     if identifier_pattern != f"{EXPECTED_SUBMITTED_ID_IDENTIFIER_PATTERN}$":
#         return (
#             f"Unexpected pattern for identifier: {identifier_pattern}."
#             f" Expected {EXPECTED_SUBMITTED_ID_IDENTIFIER_PATTERN}"
#         )
#     return ""


def test_submitted_id_validated_on_post(
    testapp: TestApp, test_submission_center: Dict[str, Any]
) -> None:
    """Test SubmittedItems validate submitted_id on POST.

    Use workbook inserts indirectly for properties.
    """
    item_properties_to_test = get_item_properties_from_workbook_inserts(
        test_submission_center
    )
    submitted_item_types = get_submitted_items(testapp)
    for item_type in loadxl_order:
        if item_type in submitted_item_types:
            assert_submitted_id_validation_on_post(
                testapp, item_type, item_properties_to_test
            )
        else:
            post_items(testapp, item_type, item_properties_to_test)
