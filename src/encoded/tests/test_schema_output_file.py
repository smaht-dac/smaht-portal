from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


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
    }
    return post_item(testapp, item, "FileFormat")


@pytest.fixture
def output_file(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
    file_format: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "aliases": ["foo:output_file-fastq"],
        "description": "Some description",
        "status": "uploading",
        "file_format": file_format["uuid"],
        "data_category": ["Sequencing Reads"],
        "data_type": ["Unaligned Reads"],
        "variant_type": ["Single Nucleotide Variant"],
    }
    return post_item(testapp, item, "OutputFile")


def test_output_file_post(output_file: Dict[str, Any]) -> None:
    """Ensure output_file properties POST."""
    pass
