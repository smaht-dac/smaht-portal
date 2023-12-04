from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import get_item, post_item


@pytest.fixture
def output_file_properties(
    file_formats: Dict[str, Dict[str, Any]],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "submission_centers": [test_submission_center["uuid"]],
        "data_category": ["Sequencing Reads"],
        "data_type": ["Unaligned Reads"],
        "file_format": file_formats.get("bam", {}).get("uuid"),
    }


def test_md5_alias_not_resource_path(
    testapp: TestApp, output_file: Dict[str, Any]
) -> None:
    """Ensure MD5 checksum alias not added to unique keys."""
    md5sum = output_file.get("md5sum")
    assert md5sum
    get_item(testapp, f"md5:{md5sum}", collection="OutputFile", status=404)


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    output_file_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately."""
    post_item(anontestapp, output_file_properties, "OutputFile", status=403)
    post_item(
        unassociated_user_app,
        output_file_properties,
        "OutputFile",
        status=422,
    )
    post_item(
        submission_center_user_app,
        output_file_properties,
        "OutputFile",
        status=403,
    )
    post_item(consortium_user_app, output_file_properties, "OutputFile", status=422)
    post_item(testapp, output_file_properties, "OutputFile", status=201)
