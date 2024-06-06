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


# @pytest.mark.workbook
# def test_validate_new_type_integer(
#     es_testapp: TestApp,
#     workbook: None,
# ) -> None:
#     """Ensure new type integer_4_to_50 validated for new type.

#     Only testing negative validation here.
#     """
#     import pdb; pdb.set_trace()
#     assert_new_type_validated_on_post(es_testapp)
#     #assert_new_type_validated_on_patch(es_testapp)


# def assert_new_type_invalid(response, new_type):
#     """Asserts new type is invalid"""
#     assert "ValidationFailure" in response.get("@type", [])
#     errors = response.get("errors", [])
#     assert errors
#     invalid_integer_error_found = False
#     patch_value = new_type.get("integer_4_to_50","")
#     threshold = 20
#     for error in errors:
#         if error.get("description") == (
#             f'Property value {patch_value} for integer_4_to_50 must be greater than or equal to {threshold}'
#         ):
#             invalid_integer_error_found = True
#             break
#     assert invalid_integer_error_found

# def assert_new_type_validated_on_patch(
#         es_testapp: TestApp,
#         workbook: None,
# ) -> None:
#     """Ensure new type integer_4_to_50 validated on PATCH."""
#     item_to_patch = get_item(
#         es_testapp,
#         "NT1",
#         "NewType")
#     uuid = item_to_patch.get("uuid","")
#     patch_value = 5
#     patch_body = {"integer_4_to_50": patch_value}
#     response = patch_item(es_testapp, patch_body, uuid, status=422)
#     assert_new_type_invalid(response, item_to_patch)

# @pytest.mark.workbook
# def assert_new_type_validated_on_post(
#         es_testapp: TestApp,
#         workbook: None,
# ) -> None:
#     """Ensure new type integer_4_to_50 validated on POST."""
#     item_to_post = {
#         "identifier": "NT2",
#         "number_string": "5678",
#         "integer_4_to_50": 15,
#         "foo_or_bar": "Foo",
#     }
#     response = post_item(
#         es_testapp,
#         item_to_post,
#         "NewType",
#         422)
#     assert_new_type_invalid(response,item_to_post)
    
