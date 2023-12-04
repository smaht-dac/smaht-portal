from webtest import TestApp

import pytest

from .utils import get_item


@pytest.mark.workbook
def test_tissue_sample_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure tissue sample properties POST properly (via workbook)."""
    get_item(es_testapp, "a311f4f4-5bbb-4be7-975a-f5b7ec7585bc")
