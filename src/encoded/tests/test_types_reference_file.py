from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def reference_file_properties(
    file_formats: Dict[str, Dict[str, Any]],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "submission_centers": [test_submission_center["uuid"]],
        "data_category": ["Sequencing Reads"],
        "data_type": ["Unaligned Reads"],
        "file_format": file_formats.get("bam", {}).get("uuid"),
    }


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    reference_file_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately."""
    post_item(anontestapp, reference_file_properties, "ReferenceFile", status=403)
    post_item(
        unassociated_user_app,
        reference_file_properties,
        "ReferenceFile",
        status=422,
    )
    post_item(
        submission_center_user_app,
        reference_file_properties,
        "ReferenceFile",
        status=403,
    )
    post_item(
        consortium_user_app, reference_file_properties, "ReferenceFile", status=422
    )
    post_item(testapp, reference_file_properties, "ReferenceFile", status=201)
