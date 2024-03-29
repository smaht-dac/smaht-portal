from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union

from pyramid.request import Request
from pyramid.view import view_config
from snovault import abstract_collection
from snovault.util import debug_log
from snovault.validators import (
    validate_item_content_post,
    validate_item_content_put,
    validate_item_content_patch,
)
from snovault.validation import ValidationFailure

from .base import Item, SMAHTCollection, collection_add, item_edit
from .utils import get_item, get_properties


"""
SubmittedItems are the item types we expect to receive from external
submitters.

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


The submission center code will be validated on item creation and edit.
The item type is hard-coded in the schema and is expected to be the exact
name of the item. The identifier portion of the `submitted_id` must only
match the regex provided for it, which is expected to be uniform for all
item types.

If looking to update the `submitted_id` pattern, the
`update_submitted_id_pattern` command in src/encoded/commands is likely
useful.
"""


SUBMITTED_ID_PROPERTY = "submitted_id"
SUBMITTED_ID_CENTER_CODE_PATTERN = "^[A-Z0-9]{3,}"
SUBMITTED_ID_IDENTIFIER_PATTERN = "[A-Z0-9-_.]{4,}$"
SUBMITTED_ID_SEPARATOR = "_"

SUBMISSION_CENTER_CODE_MISMATCH_ERROR = "Submission Code Mismatch"


@dataclass(frozen=True)
class SubmittedId:
    center_code: str
    item_type: str
    identifier: str

    def __bool__(self) -> bool:
        """Evaluate for truthiness."""
        if self.center_code or self.item_type or self.identifier:
            return True
        return False

    def to_string(self) -> str:
        """Format submitted ID back to string."""
        return (
            f"{self.center_code}{SUBMITTED_ID_SEPARATOR}{self.item_type}"
            f"{SUBMITTED_ID_SEPARATOR}{self.identifier}"
        )


def parse_submitted_id(submitted_id: str) -> SubmittedId:
    """Parse submitted_id value to dataclass of components.

    Heuristic here depends on expected format of course.
    """
    split_id = submitted_id.split(SUBMITTED_ID_SEPARATOR)
    center_code = split_id[0]
    item_type = split_id[1] if len(split_id) > 1 else ""
    identifier = SUBMITTED_ID_SEPARATOR.join(split_id[2:]) if len(split_id) > 2 else ""
    return SubmittedId(center_code, item_type, identifier)


@dataclass(frozen=True)
class SubmittedIdPattern(SubmittedId):
    pass


def parse_submitted_id_pattern(pattern: str) -> SubmittedIdPattern:
    """Parse submitted_id pattern to dataclass.

    No different from parsing a submitted_id value for now, but may
    change.
    """
    parsed_pattern = parse_submitted_id(pattern)
    return SubmittedIdPattern(
        parsed_pattern.center_code,
        parsed_pattern.item_type,
        parsed_pattern.identifier
    )


class SubmittedSmahtCollection(SMAHTCollection):
    pass


@abstract_collection(
    name="submitted-items",
    properties={
        "title": "SMaHT Submitted Item Listing",
        "description": "Abstract collection of all submitted SMaHT items.",
    },
)
class SubmittedItem(Item):

    Collection = SubmittedSmahtCollection


def validate_submitted_id_on_add(
    context: SubmittedSmahtCollection,
    request: Request,
) -> None:
    """Validate submitted_id on POST.

    Ensure submission center code and item name are correctly formatted
    and valid.
    """
    properties = get_properties(request)
    submitted_id = get_submitted_id(properties)
    if submitted_id:
        submission_centers = get_submission_centers(properties)
        validation_error = validate_submitted_id(
            request, submitted_id, submission_centers
        )
        if validation_error:
            raise validation_error


def get_submitted_id(properties: Dict[str, Any]) -> str:
    return properties.get(SUBMITTED_ID_PROPERTY, "")


def get_submission_centers(properties: Dict[str, Any]) -> List[str]:
    return properties.get("submission_centers", [])


def get_submitted_id_code(properties: Dict[str, Any]) -> str:
    """Get submission center code from properties.

    Note: `code` is lower-cased for file naming purposes but
    upper-cased for `submitted_id` purposes.
    """
    return properties.get("code", "").upper()


def validate_submitted_id(
    request: Request, submitted_id: str, submission_centers: List[str]
) -> Union[ValidationFailure, None]:
    """Validate submitted_id for given submission centers."""
    submitted_id_data = parse_submitted_id(submitted_id)
    submission_center_codes = get_submission_center_codes(request, submission_centers)
    if (
        submitted_id_data
        and submitted_id_data.center_code not in submission_center_codes
    ):
        return get_submitted_id_validation_error(
            submitted_id_data, submission_center_codes
        )
    return


def get_submitted_id_validation_error(
    submitted_id: SubmittedId, code_options: List[str]
) -> ValidationFailure:
    return ValidationFailure(
        location=SUBMITTED_ID_PROPERTY,
        name=SUBMISSION_CENTER_CODE_MISMATCH_ERROR,
        description=(
            f"Submitted ID {submitted_id.to_string()} start"
            f" ({submitted_id.center_code})"
            f" does not match options for given submission centers:"
            f" {code_options}."
        ),
    )


def get_submission_center_codes(
    request: Request, submission_centers: List[str]
) -> List[str]:
    """Get submission center codes for given submission centers."""
    submission_center_codes = [
        get_submitted_id_code(
            get_item(request, submission_center, collection="SubmissionCenter")
        )
        for submission_center in submission_centers
    ]
    return [code for code in submission_center_codes if code]


def validate_submitted_id_on_edit(
    context: SubmittedItem,
    request: Request,
) -> None:
    """Validate submitted_id on PUT/PATCH."""
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    if does_update_require_validation(properties_to_update):
        submitted_id = get_submitted_id_for_validation(
            existing_properties, properties_to_update
        )
        submission_centers = get_submission_centers_for_validation(
            existing_properties, properties_to_update
        )
        validation_error = validate_submitted_id(
            request, submitted_id, submission_centers
        )
        if validation_error:
            raise validation_error


def does_update_require_validation(update_properties: Dict[str, Any]) -> bool:
    """Determine if update requires validation."""
    return any(
        [get_submitted_id(update_properties), get_submission_centers(update_properties)]
    )


def get_submitted_id_for_validation(
    existing_properties: Dict[str, Any], update_properties: Dict[str, Any]
) -> str:
    """Get submitted_id for validation.

    If submitted_id is being updated, use the updated value.
    Otherwise, use the existing value.
    """
    return get_submitted_id(update_properties) or get_submitted_id(existing_properties)


def get_submission_centers_for_validation(
    existing_properties: Dict[str, Any], update_properties: Dict[str, Any]
) -> List[str]:
    """Get submission_centers for validation.

    If submission_centers is being updated, use the updated value.
    Otherwise, use the existing value.
    """
    return get_submission_centers(update_properties) or get_submission_centers(
        existing_properties
    )


SUBMITTED_ITEM_ADD_VALIDATORS = [
    validate_item_content_post,
    validate_submitted_id_on_add,
]
SUBMITTED_ITEM_EDIT_PUT_VALIDATORS = [
    validate_item_content_put,
    validate_submitted_id_on_edit,
]
SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS = [
    validate_item_content_patch,
    validate_submitted_id_on_edit,
]


@view_config(
    context=SubmittedSmahtCollection,
    permission="add",
    request_method="POST",
    validators=SUBMITTED_ITEM_ADD_VALIDATORS,
)
@debug_log
def submitted_collection_add(
    context: SubmittedSmahtCollection, request: Request, render: Optional[bool] = None
) -> Dict[str, Any]:
    return collection_add(context, request, render)


@view_config(
    context=SubmittedItem,
    permission="edit",
    request_method="PUT",
    validators=SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=SubmittedItem,
    permission="edit",
    request_method="PATCH",
    validators=SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
)
@debug_log
def submitted_item_edit(
    context: SubmittedItem, request: Request, render: Optional[bool] = None
) -> Dict[str, Any]:
    return item_edit(context, request, render)
