from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import assert_keys_conflict, post_item


@pytest.fixture
def file_format(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "identifier": "fastq",
        "standard_file_extension": "fastq.gz",
        "other_allowed_extensions": ["fq.gz"],
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "aliases": ["foo:file_format-fastq"],
        "description": "Some description",
        "status": "in review",
        "valid_item_types": ["OutputFile"],
    }
    return post_item(testapp, item, "FileFormat")


def test_identifier_unique(testapp: TestApp, file_format: Dict[str, Any]) -> None:
    """Ensure identifier unique across file formats."""
    item_with_duplicate_identifier = {
        "identifier": file_format.get("identifier", ""),
        "standard_file_extension": "foo",
        "consortia": file_format.get("consortia", []),
        "valid_item_types": ["OutputFile"],
    }
    response = post_item(
        testapp, item_with_duplicate_identifier, "FileFormat", status=409
    )
    assert_keys_conflict(response)
