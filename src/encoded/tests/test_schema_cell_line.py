from webtest import TestApp

import pytest

from .utils import get_item


@pytest.mark.workbook
def test_cell_line_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure cell line properties POST properly (via workbook)."""
    get_item(es_testapp, "3b411041-0127-4a03-a9dc-891cdb8d1dfa")
