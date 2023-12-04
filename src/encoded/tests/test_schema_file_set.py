import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_file_set_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure file set properties POST properly (via workbook)."""
    get_item(es_testapp, "b98f9849-3b7f-4f2f-a58f-81100954e00d")
