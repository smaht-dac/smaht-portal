import re
from typing import Any, Dict, List

from dcicutils import schema_utils
from snovault.typeinfo import TypeInfo
from webtest.app import TestApp

from .utils import (
    get_item_properties_from_workbook_inserts,
    get_schema,
    get_submitted_item_types,
    patch_item,
    post_identifying_insert,
)
from ..project.loadxl import ITEM_INDEX_ORDER as loadxl_order
from ..types.submitted_item import (
    SUBMITTED_ID_CENTER_CODE_PATTERN,
    SUBMITTED_ID_IDENTIFIER_PATTERN,
    SUBMITTED_ID_SEPARATOR,
    SUBMISSION_CENTER_CODE_MISMATCH_ERROR,
    get_submitted_id,
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
SUBMITTED_ID_PATTERN_FORMAT = re.compile(
    rf"^[\^]{re.escape(SUBMITTED_ID_CENTER_CODE_PATTERN)}"
    rf"[{SUBMITTED_ID_SEPARATOR}][A-Z-]+[{SUBMITTED_ID_SEPARATOR}]"
    rf"{re.escape(SUBMITTED_ID_IDENTIFIER_PATTERN)}[\$]$"
)

DUMMY_SUBMITTED_ID_CODE = "FOOBAR"


def test_submitted_id_code_pattern(testapp: TestApp) -> None:
    """Ensure SubmissionCenter submitter_id_code pattern as expected.

    First portion of the submitted_id corresponds to the submitted_id_code of
    SubmissionCenter, so these need to be synced.
    """
    submitted_id_code_pattern = get_submitted_id_code_pattern(testapp)
    assert submitted_id_code_pattern == (
        f"^{SUBMITTED_ID_CENTER_CODE_PATTERN}$"
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
    match = SUBMITTED_ID_PATTERN_FORMAT.match(pattern)
    if not match:
        return (
            f"Pattern {pattern} failed to match expected format"
            f" {SUBMITTED_ID_PATTERN_FORMAT}."
        )
    return ""


# def get_submitted_id_pattern_center_code_failure(pattern: str) -> str:
#     """Check submission code pattern and report issue, if found."""
#     center_code_pattern = get_center_code_pattern_from_submitted_id_pattern(
#         pattern
#     )
#     if center_code_pattern != f"^{SUBMITTED_ID_CENTER_CODE_PATTERN}":
#         return (
#             f"Unexpected pattern for SubmissionCenter code: {center_code_pattern}."
#             f" Expected {SUBMITTED_ID_CENTER_CODE_PATTERN}"
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
#     if identifier_pattern != f"{SUBMITTED_ID_IDENTIFIER_PATTERN}$":
#         return (
#             f"Unexpected pattern for identifier: {identifier_pattern}."
#             f" Expected {SUBMITTED_ID_IDENTIFIER_PATTERN}"
#         )
#     return ""


def test_submitted_id_validated_on_post_and_patch(
    testapp: TestApp, test_submission_center: Dict[str, Any]
) -> None:
    """Test SubmittedItems validate submitted_id on POST and PATCH.

    Validation performed is on SubmissionCenter code, so use a dummy
    that should fail to ensure validation performed.

    If item is SubmittedItem, test for submitted_id validation;
    otherwise, nothing to test, so just POST.

    Use workbook inserts indirectly for properties.
    """
    item_properties_to_test = get_item_properties_from_workbook_inserts(
        test_submission_center
    )
    assert_dummy_submitted_id_code_valid(item_properties_to_test)
    submitted_item_types = get_submitted_item_types(testapp)
    for item_type in loadxl_order:
        if item_type in submitted_item_types:
            assert_submitted_id_validation_on_post_and_patch(
                testapp, item_type, item_properties_to_test
            )
        else:
            post_items(testapp, item_type, item_properties_to_test)


def assert_dummy_submitted_id_code_valid(
    item_properties_to_test: Dict[str, Dict]
) -> None:
    """Ensure no conflicts between dummy code and existing ones."""
    submission_center_inserts = item_properties_to_test["submission_center"]
    existing_submitted_id_codes = [
        insert.get("submitted_id_code") for insert in submission_center_inserts
    ]
    assert DUMMY_SUBMITTED_ID_CODE not in existing_submitted_id_codes, (
        f"Dummy code {DUMMY_SUBMITTED_ID_CODE} exists in inserts and should"
        f" be changed."
    )

def assert_submitted_id_validation_on_post_and_patch(
    testapp: TestApp, item_type: str, item_properties_to_test: Dict[str, Dict]
) -> None:
    """Ensure submitted_id validated on POST.

    For first insert of item type, try to POST with an invalid
    submitted_id, check invalid as expected, then POST with
    submitted_id from workbook (which should be valid).

    For remaining inserts, just POST.
    """
    inserts_to_post = item_properties_to_test.get(item_type)
    assert inserts_to_post, f"No workbook inserts found for {item_type}"
    for idx, insert in enumerate(inserts_to_post):
        if idx == 0:
            assert_invalid_submitted_id_post(testapp, insert, item_type)
            post_identifying_insert(testapp, insert, collection=item_type)
            assert_invalid_submitted_id_on_patch(testapp, insert)
        else:
            post_identifying_insert(testapp, insert, collection=item_type)


def assert_invalid_submitted_id_post(
    testapp: TestApp, insert: Dict[str, Any], item_type: str
) -> None:
    """Trigger rejection of POST by submitted_id validator.

    Parse error message to ensure invalidation via intended validator.
    """
    invalid_submitted_id_insert = get_insert_with_invalid_submitted_id(insert)
    response = post_identifying_insert(
        testapp, invalid_submitted_id_insert, item_type, status=422
    )
    assert is_invalid_submitted_id_response(response)


def assert_invalid_submitted_id_on_patch(
    testapp: TestApp, insert: Dict[str, Any]
) -> None:
    """Trigger rejection of PATCH by submitted_id validator.

    Parse error message to ensure invalidation via intended validator.
    """
    insert_submitted_id = get_submitted_id(insert)
    invalid_submitted_id_for_insert = get_invalid_submitted_id(
        insert_submitted_id
    )
    patch_body = {"submitted_id": invalid_submitted_id_for_insert}
    response = patch_item(testapp, patch_body, insert["uuid"], status=422)
    assert is_invalid_submitted_id_response(response)


def get_insert_with_invalid_submitted_id(insert: Dict[str, Any]) -> Dict[str, Any]:
    """Create similar insert with invalid dummy submitted_id_code."""
    return {
        key: (value if key != "submitted_id" else get_invalid_submitted_id(value))
        for key, value in insert.items()
    }


def get_invalid_submitted_id(submitted_id: str) -> str:
    """Replace existing submitted_id_code in submitted_id with dummy."""
    submitted_id_without_code = f"{SUBMITTED_ID_SEPARATOR}".join(
        submitted_id.split(SUBMITTED_ID_SEPARATOR)[1:]
    )
    return (
        f"{DUMMY_SUBMITTED_ID_CODE}{SUBMITTED_ID_SEPARATOR}{submitted_id_without_code}"
    )


def is_invalid_submitted_id_response(response: Dict[str, Any]) -> bool:
    """Is response indicative of invalid submitted_id?

    Strictly expects the only error is due to the expected submitted_id
    validation failure.
    """
    error_type = response.get("@type", [])
    errors = response.get("errors", [])
    if is_error_validation_failure(error_type) and is_code_mismatch(errors):
        return True
    return False


def is_error_validation_failure(error_types: List[str]) -> bool:
    """Is ValidationFailure present in error types?"""
    return "ValidationFailure" in error_types


def is_code_mismatch(errors: List[Dict[str, str]]) -> bool:
    """Is expected code mismatch the unique error?"""
    if (
        len(errors) == 1
        and SUBMISSION_CENTER_CODE_MISMATCH_ERROR == errors[0].get("name")
    ):
        return True
    return False


def post_items(
    testapp: TestApp, item_type: str, item_properties_to_test: Dict[str, Dict]
) -> None:
    """POST all inserts for given item type."""
    for insert in item_properties_to_test.get(item_type, []):
        post_identifying_insert(testapp, insert, item_type)
