import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_cell_culture_mixture_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure cell culture mixture properties POST properly (via workbook)."""
    get_item(es_testapp, "8cf4e165-11c2-4291-9c44-95252ab9f934")
