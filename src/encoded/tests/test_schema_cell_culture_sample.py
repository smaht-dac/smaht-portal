from webtest import TestApp

import pytest

from .utils import get_item


@pytest.mark.workbook
def test_cell_culture_sample_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure cell culture sample properties POST properly (via workbook)."""
    get_item(es_testapp, "50a3f203-0363-474a-974c-c0fe2bb89e44")
