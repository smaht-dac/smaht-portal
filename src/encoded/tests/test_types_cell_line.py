import pytest
from webtest import TestApp

from .utils import get_item


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
    import pdb; pdb.set_trace()
    item=get_item(
        es_testapp,
        submitted_id,
        collection='CellLine',
        frame="object"
    )
    assert item.get("source_donor","") == expected