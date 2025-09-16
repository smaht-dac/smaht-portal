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
@pytest.mark.parametrize(
    "donor_data,expected_no_diff",
    [
        (
            { 'Donor': [ { "submitted_id": "TEST_DONOR_MALE", "age": 45 } ] },
            {"TEST_DONOR_MALE"}
        ),
        (
            { 'Donor': [ { "submitted_id": "TEST_DONOR_MALE", "age": 5 } ] },
            set()
        ),
    ]
)
def test_donor_diff(portal, workbook: None, donor_data, expected_no_diff):
    structured_data = add_items(donor_data, StructuredDataSet(portal=portal))
    no_diff_items = get_no_diff_items(structured_data)
    assert no_diff_items == expected_no_diff, no_diff_items
