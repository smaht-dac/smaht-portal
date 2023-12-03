import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_sample_preparation_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure tissue sample prep properties POST properly (via workbook)."""
    get_item(es_testapp, "70fba140-fcb2-495d-9c0c-5ab04936bb88")
