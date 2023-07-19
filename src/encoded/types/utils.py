from typing import Iterable, List, Union

import structlog
from pyramid.request import Request

from ..type_annotations import JsonObject


log = structlog.getLogger(__name__)


CENTER_SUBMITTER_IDS_SCHEMA = {
    "title": "Center Submitter IDs",
    "description": "Submission center-specific identifiers",
    "type": "array",
    "uniqueItems": True,
    "items": {
        "title": "Center Submitter ID",
        "type": "string",
        "uniqueKey": True,
    }
}


def get_unique_center_submitter_ids(
    submitter_id: str,
    submission_center_identifiers: Iterable[str],
    request: Request,
) -> Union[List[str], None]:
    submission_center_names = get_submission_center_names(submission_center_identifiers, request)
    if submission_center_names:
        return [
            f"{submission_center_name}:{submitter_id}"
            for submission_center_name in submission_center_names
        ]
    return


def get_submission_center_names(
    submission_center_identifiers: Iterable[str], request: Request
) -> List[str]:
    result = []
    for submission_center_identifier in submission_center_identifiers:
        name = get_submission_center_name(submission_center_identifier, request)
        if name:
            result.append(name)
    return result


def get_submission_center_name(
    submission_center_identifier: str, request: Request
) -> str:
    submission_center = get_item(submission_center_identifier, request)
    return submission_center.get("identifier", "")


def get_item(identifier: str, request: Request) -> JsonObject:
    try:
        result = request.embed(identifier, "@@object")
    except Exception as e:
        log.warning(
            f"Failed to find given identifier ({identifier}) via request : {e}"
            " ({type(e).__name__}"
        )
        result = {}
    return result
