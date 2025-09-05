import pytest
from dcicutils.structured_data import Portal, StructuredDataSet
from encoded.ingestion.ingestion_processors import get_no_diff_items
from .helpers import workbook_lookup


def add_items(data: dict, structured_data: StructuredDataSet) -> StructuredDataSet:
    for item_type in data:
        structured_data._add(item_type, data[item_type])
    return structured_data


@pytest.mark.workbook
def test_identical_donor():

    identical_donor = { 'Donor': [ {
        "submitted_id": "TEST_DONOR_MALE",
        "external_id": "ST001",
        "submission_centers": ["smaht"],
        "age": 45,
        "sex": "Male",
        "tpc_submitted": "True",
    } ] }

    structured_data = add_items(identical_donor, StructuredDataSet(portal = Portal()))
    assert get_no_diff_items(structured_data) == set()


@pytest.mark.workbook
def test_diff_donor():

    # print(workbook_lookup("Donor", True))

    diff_donor = { 'Donor': [ {
        "submitted_id": "TEST_DONOR_MALE",
        "external_id": "ST001",
        "submission_centers": ["smaht"],
        "age": 5,
        "sex": "Male",
        "tpc_submitted": "True",
    } ] }

    structured_data = StructuredDataSet()
    for object_type in diff_donor:
        structured_data._add(object_type, diff_donor[object_type])
    
    assert get_no_diff_items(structured_data) == {"TEST_DONOR_MALE"}
