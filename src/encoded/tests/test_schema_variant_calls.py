import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_variant_calls_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure file properties POST properly (via workbook)."""
    get_item(es_testapp, "35f2299b-86e8-47e1-96a3-c5a5ec5d49a6")
