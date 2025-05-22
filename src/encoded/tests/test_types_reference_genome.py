import pytest
from webtest.app import TestApp

from .utils import get_item_from_search

from ..item_utils import item as item_utils


@pytest.mark.workbook
def test_display_title_preferred_name(
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure reference genome override of display_title works with preferred_name."""
    item = get_item_from_search(
        es_testapp, 'reference_genome', add_on="&preferred_name!=No+value"
    )
    assert item_utils.get_display_title(item) == item_utils.get_preferred_name(item)