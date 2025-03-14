from typing import Dict, Any

import re
import pytest
from webtest import TestApp

from .utils import (
    post_item,
    patch_item,
    get_item,
    delete_field,
)

from ..item_utils import (
     item as item_utils,
     file as file_utils,
     unaligned_reads as ur_utils
)

@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for unaligned reads file
    within SubmittedFile collection.
    """
    get_item(
        es_testapp,
        "TEST_UNALIGNED-READS_LIVER-FASTQ-R1",
        collection="UnalignedReads",
        status=301,
    )
    get_item(
        es_testapp,
        "TEST_UNALIGNED-READS_LIVER-FASTQ-R1",
        collection="SubmittedFile",
        status=301,
    )


@pytest.mark.workbook
@pytest.mark.parametrize(
    "file_insert,patch_body,expected_status", [
    (pytest.param(
    "TEST_UNALIGNED-READS_LIVER-FASTQ-R2",
    {"paired_with": "TEST_UNALIGNED-READS_LIVER-FASTQ-R1"}, 200, id="first_test")), #R1 file in same fileset
    ("TEST_UNALIGNED-READS_LIVER-FASTQ-R2",
    {"paired_with": "TEST_UNALIGNED-READS_LIVER-FASTQ-R2"}, 422), # R2 file paired with R2 file in different fileset
    ("TEST_UNALIGNED-READS_LIVER-FASTQ-R2",
    {"paired_with": "TEST_UNALIGNED-READS_HELA-FASTQ-R1"}, 422), # R1 file paired with R2 file in different fileset
    ("TEST_UNALIGNED-READS_LIVER-FASTQ-R2",
    {"paired_with":"TEST_UNALIGNED-READS_FASTQ_NO_READ_PAIR_NUMBER"}, 422), # no read_pair_number
    ("TEST_UNALIGNED-READS_LIVER-FASTQ-R1",
    {"paired_with": "TEST_UNALIGNED-READS_LIVER-FASTQ-R2"}, 422), # R1 paired_with to R2
    ]
)
def test_validate_read_pairs_on_patch(
    request,
    es_testapp: TestApp,
    workbook: None,
    file_insert: str,
    patch_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure R2 files are paired with R1 files on PATCH."""
    r2_file=get_item(
        es_testapp,
        file_insert,
        "UnalignedReads"
    )
    identifying_post_body = {
        "uuid": "1553d19e-d8b9-4674-b239-4ec6bb7f4f81",
        "submitted_id": "TEST_UNALIGNED-READS_TEST0",
        "file_format": file_utils.get_file_format(r2_file),
        "file_sets": file_utils.get_file_sets(r2_file),
        "filename": "test_fastq.fastq.gz",
        "submission_centers": item_utils.get_submission_centers(r2_file),
        "read_pair_number": ur_utils.get_read_pair_number(r2_file),
        "paired_with": ur_utils.get_paired_with(r2_file)
    }
    if request.node.name == "test_validate_read_pairs_on_patch[first_test]":
        post_item(es_testapp, identifying_post_body, 'unaligned_reads') # If it's the first test, post item
    uuid = identifying_post_body["uuid"]
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "file_insert,paired_with,expected_status,index", [
    ("TEST_UNALIGNED-READS_LIVER-FASTQ-R2","TEST_UNALIGNED-READS_LIVER-FASTQ-R1", 201, 1), #R1 file in same fileset
    ("TEST_UNALIGNED-READS_LIVER-FASTQ-R2","TEST_UNALIGNED-READS_HELA-FASTQ-R2", 422, 2), # R2 file paired with R2 file in different fileset
    ("TEST_UNALIGNED-READS_LIVER-FASTQ-R2","TEST_UNALIGNED-READS_HELA-FASTQ-R1", 422, 3), # R1 file paired with R2 file in different fileset
    ("TEST_UNALIGNED-READS_LIVER-FASTQ-R2","TEST_UNALIGNED-READS_FASTQ_NO_READ_PAIR_NUMBER", 422, 4), # no read_pair_number
    ("TEST_UNALIGNED-READS_LIVER-FASTQ-R1","TEST_UNALIGNED-READS_LIVER-FASTQ-R2", 422, 5), # R1 paired_with to R2
    ("TEST_UNALIGNED-READS_HELA-FASTQ-R1","", 201, 6), # R1 with no paired_with
    ]
)
def test_validate_read_pairs_on_post(
    es_testapp: TestApp,
    workbook: None,
    file_insert: str,
    paired_with: str,
    expected_status: int,
    index: int
) -> None:
    """Ensure R2 files are paired with R1 files on POST."""
    r2_file=get_item(
        es_testapp,
        file_insert,
        "UnalignedReads"
    )
    identifying_post_body = {
        "submitted_id": f"TEST_UNALIGNED-READS_TEST{index}",
        "file_format": file_utils.get_file_format(r2_file),
        "file_sets": file_utils.get_file_sets(r2_file),
        "filename": "test_R2.fastq.gz",
        "submission_centers": item_utils.get_submission_centers(r2_file),
        "read_pair_number": ur_utils.get_read_pair_number(r2_file),
    }
    if paired_with:
        identifying_post_body['paired_with'] = paired_with
    post_item(es_testapp, identifying_post_body, 'unaligned_reads',status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status", [
        ({"software": ["TEST_SOFTWARE_DORADO", "TEST_SOFTWARE_BWA-MEM_2.0.0"]}, 200),
        ({"software": ["TEST_SOFTWARE_BWA-MEM_2.0.0"]}, 422),
        ({"software": ["TEST_SOFTWARE_DORADO"]}, 200),
    ]
)
def test_validate_basecalling_software_for_ont_on_edit(
    request,
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int
) -> None:
    """Ensure software items contains Basecaller for ONT files on edit."""
    uuid = item_utils.get_uuid(
        get_item(es_testapp, "TEST_UNALIGNED-READS_HELA-HEK293-BAM", collection="UnalignedReads", status=301)
    )
    patch_item(es_testapp, patch_body, uuid, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status,index", [
        ({"software": ["TEST_SOFTWARE_DORADO", "TEST_SOFTWARE_BWA-MEM_2.0.0"]}, 201, 1),
        ({"software": ["TEST_SOFTWARE_BWA-MEM_2.0.0"]}, 422, 2),
        ({"software": ["TEST_SOFTWARE_DORADO"]}, 201, 3),
    ]
)
def test_validate_basecalling_software_for_ont_on_add(
    request,
    es_testapp: TestApp,
    workbook: None,
    patch_body: Dict[str, Any],
    expected_status: int,
    index: int
) -> None:
    """Ensure software items contains Basecaller for ONT files on edit."""
    insert = get_item(es_testapp, "TEST_UNALIGNED-READS_HELA-HEK293-BAM", collection="UnalignedReads", status=301)

    identifying_post_body = {
        **patch_body,
        "submitted_id": f"TEST_UNALIGNED-READS_ONT-TEST{index}",
        "file_format": file_utils.get_file_format(insert),
        "file_sets": file_utils.get_file_sets(insert),
        "filename": "test_bam.bam",
        "submission_centers": item_utils.get_submission_centers(insert),
    }
    post_item(es_testapp, identifying_post_body,'unaligned_reads', status=expected_status)