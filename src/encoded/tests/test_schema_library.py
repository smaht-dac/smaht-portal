from webtest import TestApp

import pytest

from .utils import get_item


@pytest.mark.workbook
def test_library_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure library properties POST properly (via workbook)."""
    get_item(es_testapp, "6fa52580-fc11-402c-aae0-1eb1875dc560")
