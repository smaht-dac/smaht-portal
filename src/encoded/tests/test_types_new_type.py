import pytest
from typing import Dict, Any
from webtest import TestApp

from .utils import (
    get_item,
    post_item,
    patch_item,
)


@pytest.mark.workbook
def test_string_and_number_calc_prop(
        es_testapp: TestApp,
        workbook: None
        ) -> None:
    """Ensure string_and_number calc prop gives expected value"""
    expected="Bar 31"
    new_type = get_item(
        es_testapp,
        "NT1",
        collection="NewType"
    )
    string_and_number = new_type.get("string_and_number","")
    assert string_and_number == expected

@pytest.mark.workbook
def test_submission_centers(
    es_testapp: TestApp,
    workbook: None
    ) -> None:
    """Ensure 'submission_centers' calc prop working."""
    expected = ["SMaHT Test Center"]
    new_type = get_item(
        es_testapp,
        "NT1",
        collection="NewType"
    )
    submission_center_display_title = new_type.get("submission_centers_display_title","")
    assert submission_center_display_title == expected

@pytest.mark.workbook
def test_unaligned_read_rev_link(
    es_testapp: TestApp,
    workbook: None) -> None:
    """Ensure 'unaligned reads' rev link calc prop working."""
    ur_item= get_item(
        es_testapp,
        "TEST_UNALIGNED-READS_FASTQ",
        collection="UnalignedReads",
    )
    expected = ur_item.get("display_title","")
    new_type = get_item(
        es_testapp,
        "NT1",
        collection="NewType"
    )
    unaligned_read_rev_link = new_type.get("unaligned_reads","")[0].get("display_title","")
    assert unaligned_read_rev_link == expected
