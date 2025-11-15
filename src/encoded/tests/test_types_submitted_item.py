import re
from typing import Any, Dict, List

from dcicutils import schema_utils
from snovault.typeinfo import TypeInfo
from webtest.app import TestApp

from .utils import (
    get_functional_item_types,
    get_item_properties_from_workbook_inserts,
    get_schema,
    get_submitted_item_types,
    get_workbook_inserts_for_collection,
    has_submitted_id,
    is_submitted_item,
    patch_item,
    post_identifying_insert,
)
from ..project.loadxl import ITEM_INDEX_ORDER as loadxl_order
from ..types.submitted_item import (
    SUBMITTED_ID_CENTER_CODE_PATTERN,
    SUBMITTED_ID_IDENTIFIER_PATTERN,
    SUBMITTED_ID_PROPERTY,
    SUBMITTED_ID_SEPARATOR,
    SUBMISSION_CENTER_CODE_MISMATCH_ERROR,
    get_submitted_id,
    parse_submitted_id_pattern,
)


SUBMITTED_ID_PATTERN_FORMAT = re.compile(
    rf"^{re.escape(SUBMITTED_ID_CENTER_CODE_PATTERN)}"
    rf"[{SUBMITTED_ID_SEPARATOR}][A-Z-]+[{SUBMITTED_ID_SEPARATOR}]"
    rf"{re.escape(SUBMITTED_ID_IDENTIFIER_PATTERN)}$"
)

WORKBOOK_SUBMISSION_CENTER_CODE = "test"
DUMMY_SUBMITTED_ID_CODE = "FOOBAR"


def test_submitted_id_code_pattern(testapp: TestApp) -> None:
    """Ensure SubmissionCenter `code` pattern as expected.

    First portion of the submitted_id corresponds to the code of
    SubmissionCenter, so these need to be synced.
    """
    submitted_id_code_pattern = get_submitted_id_code_pattern(testapp)
    assert submitted_id_code_pattern == (f"{SUBMITTED_ID_CENTER_CODE_PATTERN}$")


def get_submitted_id_code_pattern(testapp: TestApp) -> str:
    """Get SubmissionCenter `code` pattern.

    `code` pattern is lowercase for file naming, but `submitted_id` is
    uppercase, so convert for comparison.
    """
    submission_center_schema = get_schema(testapp, "submission_center")
    submission_center_code = schema_utils.get_property(submission_center_schema, "code")
    code_pattern = schema_utils.get_pattern(submission_center_code)
    return code_pattern.upper()


def test_submitted_id_patterns(testapp: TestApp) -> None:
    """Ensure submitted_id regex patterns as expected.

    Expectations are:
        - Pattern present
        - Submission center code pattern uniformly applied
        - Item type code matches item name or known exception
        - Identifying code pattern uniformly applied
    """
    pattern_failures = get_submitted_id_pattern_failures(testapp)
    assert (
        not pattern_failures
    ), f"Issues found for submitted_id patterns: {pattern_failures}"


def get_submitted_id_pattern_failures(testapp: TestApp) -> List[str]:
    """Get failure messages for submitted_id patterns."""
    result = []
    submitted_items = get_submitted_item_types(testapp)
    for item_name, type_info in submitted_items.items():
        pattern_failure = get_submitted_id_pattern_failure(item_name, type_info)
        if pattern_failure:
            result.append(pattern_failure)
    return result


def get_submitted_id_pattern_failure(item_name: str, type_info: TypeInfo) -> str:
    """Report submitted_id pattern issues, if present."""
    pattern_issues = get_submitted_id_pattern_issues(type_info)
    if pattern_issues:
        return f"{item_name}: {pattern_issues}"
    return ""


def get_submitted_id_pattern(type_info: TypeInfo) -> str:
    """Get schema regex pattern for submitted_id."""
    submitted_id = schema_utils.get_property(type_info.schema, SUBMITTED_ID_PROPERTY)
    return schema_utils.get_pattern(submitted_id)


def get_item_type_from_submitted_id_pattern(submitted_id_pattern: str) -> str:
    """Return portion of submitted_id pattern for item type."""
    submitted_id_pattern_data = parse_submitted_id_pattern(submitted_id_pattern)
    return submitted_id_pattern_data.item_type


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


def test_submitted_id_validated_on_post_and_patch(testapp: TestApp) -> None:
    """Test SubmittedItems validate submitted_id on POST and PATCH.

    Validation performed is on SubmissionCenter code, so use a dummy
    that should fail to ensure validation performed.

    If item is SubmittedItem, test for submitted_id validation;
    otherwise, nothing to test, so just POST.

    Use workbook inserts indirectly for properties.
    """
    submission_center = get_test_submission_center_from_inserts(testapp)
    item_properties_to_test = get_item_properties_from_workbook_inserts(
        submission_center
    )
    assert_dummy_submitted_id_code_valid(item_properties_to_test)
    submitted_item_types = get_submitted_item_types(testapp)
    for item_type in loadxl_order:
        if item_type == "submission_center":
            continue  # Already POSTed relevant SubmissionCenter
        if item_type in submitted_item_types:
            #if item_type == 'tissue_sample':
            #    import pdb; pdb.set_trace()
            assert_submitted_id_validation_on_post_and_patch(
                testapp, item_type, item_properties_to_test
            )
        else:
            post_items(testapp, item_type, item_properties_to_test)


def get_test_submission_center_from_inserts(testapp: TestApp) -> Dict[str, Any]:
    """Get SubmissionCenter from workbook used for submitted IDs."""
    submission_center_inserts = get_workbook_inserts_for_collection("submission_center")
    submission_center_to_use = get_test_submission_center(submission_center_inserts)
    return post_identifying_insert(
        testapp, submission_center_to_use, "submission_center"
    )


def get_test_submission_center(
    submission_center_inserts: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Get SubmissionCenter to use for submitted IDs."""
    matching_centers = [
        insert
        for insert in submission_center_inserts
        if insert.get("code") == WORKBOOK_SUBMISSION_CENTER_CODE
    ]
    assert len(matching_centers) == 1, (
        f"Expected one SubmissionCenter with code {WORKBOOK_SUBMISSION_CENTER_CODE}"
        f" but found {len(matching_centers)}"
    )
    return matching_centers[0]


def assert_dummy_submitted_id_code_valid(
    item_properties_to_test: Dict[str, Dict],
) -> None:
    """Ensure no conflicts between dummy code and existing ones."""
    submission_center_inserts = item_properties_to_test["submission_center"]
    existing_submitted_id_codes = [
        insert.get("code") for insert in submission_center_inserts
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
    invalid_submitted_id_for_insert = get_invalid_submitted_id(insert_submitted_id)
    patch_body = {SUBMITTED_ID_PROPERTY: invalid_submitted_id_for_insert}
    response = patch_item(testapp, patch_body, insert["uuid"], status=422)
    assert is_invalid_submitted_id_response(response)


def get_insert_with_invalid_submitted_id(insert: Dict[str, Any]) -> Dict[str, Any]:
    """Create similar insert with invalid dummy submitted_id_code."""
    return {
        key: (
            value if key != SUBMITTED_ID_PROPERTY else get_invalid_submitted_id(value)
        )
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
    if len(errors) == 1 and SUBMISSION_CENTER_CODE_MISMATCH_ERROR == errors[0].get(
        "name"
    ):
        return True
    return False


def post_items(
    testapp: TestApp, item_type: str, item_properties_to_test: Dict[str, Dict]
) -> None:
    """POST all inserts for given item type."""
    for insert in item_properties_to_test.get(item_type, []):
        post_identifying_insert(testapp, insert, item_type)


def test_submitted_items_have_submitted_id(testapp: TestApp) -> None:
    """Test presence of submitted_id on all SubmittedItem children."""
    submitted_item_types = get_submitted_item_types(testapp)
    for item_name, type_info in submitted_item_types.items():
        assert has_submitted_id(
            type_info
        ), f"{item_name} is child of SubmittedItem but lacks 'submitted_id'"


def test_items_with_submitted_id_are_submitted_items(testapp: TestApp) -> None:
    """Test items with submitted_id property are of type SubmittedItem.

    Also, ensure the inverse.
    """
    functional_item_types = get_functional_item_types(testapp)
    for item_name, type_info in functional_item_types.items():
        if has_submitted_id(type_info):
            assert is_submitted_item(
                type_info
            ), f"{item_name} has 'submitted_id' but is not SubmittedItem"
        else:
            assert not is_submitted_item(
                type_info
            ), f"{item_name} is SubmittedItem but lacks 'submitted_id'"
