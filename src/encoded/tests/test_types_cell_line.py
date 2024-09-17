import pytest
from webtest import TestApp

from .utils import get_item
from ..item_utils import item as item_utils

@pytest.mark.parametrize(
        "submitted_id,expected",
        [
            ("TEST_CELL-LINE_HELA","TEST_DONOR_FEMALE"),
            ("TEST_CELL-LINE_FIBROBLAST","TEST_DONOR_FEMALE"),
            ("TEST_CELL-LINE_IPSC_FIBROBLAST","TEST_DONOR_FEMALE"),
        ]
)
@pytest.mark.workbook
def test_source_donor_calc_prop(
    es_testapp: TestApp,
    workbook: None,
    submitted_id: str,
    expected: str
    ) -> None:
    """Ensure donor calc prop works as expected."""
    item=get_item(
        es_testapp,
        submitted_id,
        collection='CellLine'
    )
    expected_donor = item_utils.get_uuid(
        get_item(
            es_testapp,
            expected,
            collection='Donor',
            frame="object"
        )
    )
    assert item_utils.get_uuid(item.get("source_donor","")) == expected_donor