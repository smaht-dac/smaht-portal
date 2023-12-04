import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_cell_culture_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure cell culture properties POST properly (via workbook)."""
    get_item(es_testapp, "e41ce31c-0b4c-4959-bf84-78aeb9f26caf")
