from webtest import TestApp

import pytest

from .utils import get_item


@pytest.mark.workbook
def test_library_preparation_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure library prep properties POST properly (via workbook)."""
    get_item(es_testapp, "934cd53c-006e-42ce-841d-5dbd50283579")
