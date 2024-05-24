import pytest
from typing import Dict, Any
from webtest import TestApp
from dcicutils.schema_utils import get_property

from .utils import get_item, post_item, post_item_and_return_location
# from ..item_utils import (
#     new_type as new_type_utils,
#     item as item_utils,
# )
@pytest.fixture
def new_type(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
    #test_tissue_sample: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "identifier": "NT1",
        "last_modified": {
            "date_modified": "2018-11-13T20:20:39+00:00"
        },
        "date": "2024-05-17",
        "foo_or_bar": "Bar",
        "integer_4_to_50": 31,
        #"tissue_samples_link": [test_tissue_sample["uuid"]],
        "object_with_add_properties": {
            "key1" : 1,
            "key2" : "2"
        },
        "object_without_add_properties": {
            "key1" : 1,
            "key2" : "2"
        },
        "number_string": "1234",
        "unique_array": ["a","b","c"],
        "urls": ["https://github.com/smaht-dac/smaht-portal"],
    }
    return post_item(testapp, item, "NewType")


# Make fixture with just toy item of tissue_sample
#@pytest.mark.workbook
# def test_submitted_id_resource_path(testapp: TestApp) -> None:
#     """Ensure identifier is available resource path for new type within collection.

#     Note: Must match a New Type 'identifier' in temp-local-inserts
#     """
#     get_item(testapp, "NT1", collection="NewType", status=301)

def test_string_and_number_calc_prop(new_type: Dict[str, Any]) -> None:
    """Ensure string_and_number calc prop gives expected value"""
    expected="Bar 31"
    # item = get_item(
    #     testapp,
    #     "NT1",
    #     collection="NewType"
    # )
    string_and_number = new_type.get("string_and_number","")
    assert string_and_number == expected

def test_submission_centers(
    testapp: TestApp,
    new_type: Dict[str, Any]) -> None:
    """Ensure 'submission_centers' calc prop working."""
    expected = ["SMaHT Test GCC"]
    submission_center_display_title = new_type.get("submission_centers_display_title","")

    assert submission_center_display_title == expected


# def test_tissue_samples(es_testapp: TestApp, workbook: None) -> None:
#     """Ensure 'tissue_samples' calc prop working.
    
#     Expected values determined here by parsing file properties/embeds
#     """
#     expected=["TEST_TISSUE-SAMPLE_LIVER"]
#     # Might be 'SMHT-0001'
#     #import pdb; pdb.set_trace()
#     item = get_item(
#         es_testapp,
#         "NT1",
#         collection="NewType"
#     )
#     #tissue_samples = new_type_utils.get_tissue_samples(item)
#     display_title = item.get("tissue_samples_display_title",[])
#     assert  display_title == expected


@pytest.fixture
def donor_properties(
    test_second_submission_center: Dict[str, Any],
    new_type: Dict[str, Any],
    ) -> Dict[str, Any]:
    """Donor properties not added to database.

    Useful for testing posting permissions.
    """
    return {
        "submission_centers": [test_second_submission_center["uuid"]],
        "submitted_id": "SECONDTEST_DONOR_1234",
        "age": 35,
        "sex": "Male",
        "has_new_type": [new_type["uuid"]]
    }


@pytest.fixture
def donor(testapp: TestApp, donor_properties: Dict[str, Any]) -> Dict[str, Any]:
    return post_item(testapp, donor_properties, "Donor")
    #return post_item_and_return_location(testapp, item, 'new_type')

def test_donor_rev_link(testapp: TestApp,
    new_type: Dict[str, Any],
    donor: Dict[str, Any]) -> None:
    """Ensure 'donor' rev link calc prop working."""
    expected = donor.get("submission_id","")
    donor_rev_link = new_type.get("donor","")

    assert donor_rev_link == expected