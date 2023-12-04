from webtest import TestApp

import pytest

from .utils import get_item


@pytest.mark.workbook
def test_tissue_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure tissue properties POST properly (via workbook)."""
    get_item(es_testapp, "b50c1dde-9fd0-4bd7-a197-726a095f6ffd")
