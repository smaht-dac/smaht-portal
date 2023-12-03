import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_analyte_prep_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure analyte prep properties POST properly (via workbook)."""
    get_item(es_testapp, "c08a9f84-1261-491f-b60f-8304486a3193")
