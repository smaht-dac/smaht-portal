import pytest
from dcicutils.structured_data import Portal, StructuredDataSet
from encoded.ingestion.ingestion_processors import get_no_diff_items
from webtest.app import TestApp


def add_items(data: dict, structured_data: StructuredDataSet) -> StructuredDataSet:
    for item_type in data:
        structured_data._add(item_type, data[item_type])
    return structured_data


@pytest.fixture(scope="module")
def portal(es_testapp):
    return Portal(es_testapp)


@pytest.mark.workbook
def test_identical_donor(portal, workbook: None):
    identical_donor = { 'Donor': [ {
        "submitted_id": "TEST_DONOR_MALE",
        "external_id": "ST001",
        "submission_centers": ["smaht"],
        "age": 45,
        "sex": "Male",
        "tpc_submitted": "True",
    } ] }

    structured_data = add_items(identical_donor, StructuredDataSet(portal=portal))
    no_diff_items = get_no_diff_items(structured_data)
    assert no_diff_items == {"TEST_DONOR_MALE"}, no_diff_items


@pytest.mark.workbook
def test_diff_donor(portal, workbook: None):
    diff_donor = { 'Donor': [ {
        "submitted_id": "TEST_DONOR_MALE",
        "external_id": "ST001",
        "submission_centers": ["smaht"],
        "age": 5,
        "sex": "Male",
        "tpc_submitted": "True",
    } ] }

    structured_data = add_items(diff_donor, StructuredDataSet(portal=portal))
    no_diff_items = get_no_diff_items(structured_data)
    assert no_diff_items == set(), no_diff_items
