from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .datafixtures import TEST_SUBMISSION_CENTER_CODE
from .utils import patch_item, post_item


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
