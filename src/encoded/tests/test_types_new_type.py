import pytest
from typing import Dict, Any
from webtest import TestApp
from dcicutils.schema_utils import get_property

from .utils import get_item, post_item, post_item_and_return_location

# @pytest.fixture
# def new_type(
#     testapp: TestApp,
#     test_consortium: Dict[str, Any],
#     test_submission_center: Dict[str, Any],
# ) -> Dict[str, Any]:
#     item = {
#         "consortia": [test_consortium["uuid"]],
#         "submission_centers": [test_submission_center["uuid"]],
#         "identifier": "NT1",
#         "last_modified": {
#             "date_modified": "2018-11-13T20:20:39+00:00"
#         },
#         "date": "2024-05-17",
#         "foo_or_bar": "Bar",
#         "integer_4_to_50": 31,
#         "object_with_add_properties": {
#             "key1" : 1,
#             "key2" : "2"
#         },
#         "object_without_add_properties": {
#             "key1" : 1,
#             "key2" : "2"
#         },
#         "number_string": "1234",
#         "unique_array": ["a","b","c"],
#         "urls": ["https://github.com/smaht-dac/smaht-portal"],
#     }
#     return post_item(testapp, item, "NewType")

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
        "NewType"
    )
    string_and_number = new_type.get("string_and_number","")
    assert string_and_number == expected


def test_submission_centers(
    es_testapp: TestApp,
    workbook: None
    ) -> None:
    """Ensure 'submission_centers' calc prop working."""
    expected = ["SMaHT Test Center"]
    new_type = get_item(
        es_testapp,
        "NT1",
        "NewType"
    )
    submission_center_display_title = new_type.get("submission_centers_display_title","")
    assert submission_center_display_title == expected


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