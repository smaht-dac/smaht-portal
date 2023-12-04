from webtest import TestApp

import pytest

from .utils import get_item


@pytest.mark.workbook
def test_cell_sample_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure cell sample properties POST properly (via workbook)."""
    get_item(es_testapp, "a11574d0-504d-4b41-bc4a-0a9acf172a2a")
