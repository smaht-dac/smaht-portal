from typing import Dict, Any

import re
import pytest
from webtest import TestApp

from .utils import (
    post_item,
    patch_item,
    get_item
)

@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for unaligned reads file
    within SubmittedFile collection.
    """
    get_item(
        es_testapp,
        "TEST_UNALIGNED-READS_FASTQ",
        collection="UnalignedReads",
        status=301,
    )
    get_item(
        es_testapp,
        "TEST_UNALIGNED-READS_FASTQ",
        collection="SubmittedFile",
        status=301,
    )


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"read_pair_number": "R2","paired_with":"TEST_UNALIGNED-READS_FASTQ"}, 200),
        ({"read_pair_number": "R2","paired_with":"TEST_UNALIGNED-READS_FASTQ_NO_READ_PAIR_NUMBER"}, 422)
    ]
)
def test_validate_read_pairs_on_patch(
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure R2 files are paired with R1 files on PATCH."""
    identifier = get_item(es_testapp,"TEST_UNALIGNED-READS_FASTQ_R2","UnalignedReads").get("uuid","")
    if expected_status == 422:
        response = patch_item(es_testapp, patch_body, identifier,status=expected_status)
        assert assert_paired_with_invalid(response)
    elif expected_status == 200:
        patch_item(es_testapp, patch_body, identifier,status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "post_body,expected_status", [
        ({"read_pair_number": "R2","paired_with":"TEST_UNALIGNED-READS_FASTQ"}, 200),
        ({"read_pair_number": "R2","paired_with":"TEST_UNALIGNED-READS_FASTQ_NO_READ_PAIR_NUMBER"}, 422)
    ]
)
def test_validate_read_pairs_on_post(
    es_testapp: TestApp,
    workbook: None,
    post_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure R2 files are paired with R1 files on PATCH."""
    r2_insert = get_item(es_testapp,"TEST_UNALIGNED-READS_FASTQ_R2","UnalignedReads")
    identifying_post_body = {
        "submitted_id": "TEST_UNALIGNED-READS_TEST",
        "file_format": r2_insert.get("file_format",""),
        "file_sets": r2_insert.get("file_sets",[]),
        "filename": "test_R2.fastq.gz",
        "submission_centers": r2_insert.get("submission_centers",[]),
        **post_body
    }
    if expected_status == 422:
        response = post_item(es_testapp,identifying_post_body,'unaligned_reads',status=expected_status)
        assert assert_paired_with_invalid(response)
    elif expected_status == 200:
        post_item(es_testapp,identifying_post_body,'unaligned_reads')



def assert_paired_with_invalid(
    response: Dict[str, Any],
) -> bool:
    """Ensure invalid paired_with link error in response."""
    assert "ValidationFailure" in response.get("@type", [])
    assert response.get("status") == "error"
    errors = response.get("errors", [])

    error_msg = "paired_with file must have read_pair_number of R1"
    assert errors
    invalid_paired_with_error_found = False
    for error in errors:
        if re.search(error_msg,error.get("description")):
            invalid_paired_with_error_found = True
            break
    return invalid_paired_with_error_found