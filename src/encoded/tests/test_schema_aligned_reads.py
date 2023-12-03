import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_aligned_reads_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure file properties POST properly (via workbook)."""
    get_item(es_testapp, "303985cf-f1db-4dea-9782-2e68092d603d")
