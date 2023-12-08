from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def extra_file_format(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "identifier": "fastq_extra",
        "standard_file_extension": "extra_fastq.gz",
        "consortia": [test_consortium["uuid"]],
    }
    return post_item(testapp, item, "FileFormat")


@pytest.fixture
def file_format(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
    extra_file_format: Dict[str, Any],
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
        "extra_file_formats": [extra_file_format["uuid"]],
    }
    return post_item(testapp, item, "FileFormat")


@pytest.fixture
def reference_file(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
    file_format: Dict[str, Any],
    extra_file_format: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "aliases": ["foo:reference_file-fastq"],
        "description": "Some description",
        "status": "uploading",
        "file_format": file_format["uuid"],
        "data_category": ["Sequencing Reads"],
        "data_type": ["Unaligned Reads"],
        "variant_type": ["Single Nucleotide Variant"],
        "extra_files": [{"file_format": extra_file_format["uuid"]}],
    }
    return post_item(testapp, item, "ReferenceFile")


def test_reference_file_post(reference_file: Dict[str, Any]) -> None:
    """Ensure reference_file properties POST."""
    pass
