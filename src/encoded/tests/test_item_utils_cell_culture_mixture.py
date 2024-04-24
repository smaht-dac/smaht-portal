import pytest
from webtest import TestApp

from .utils import get_search
from ..item_utils.cell_culture_mixture import get_cell_line_codes
from ..item_utils.utils import RequestHandler


@pytest.mark.workbook
def test_get_cell_line_codes(es_testapp: TestApp, workbook: None) -> None:
    """Test cell line codes extracted from CellCultureMixture."""
    cell_culture_mixture_search = get_search(
        es_testapp, "type=CellCultureMixture&tags=test_cell_line_codes"
    )
    assert len(cell_culture_mixture_search) == 1
    request_handler = RequestHandler(test_app=es_testapp)
    result = get_cell_line_codes(request_handler, cell_culture_mixture_search[0])
    assert result == ["HELA", "HEK293"]

