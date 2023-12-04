import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_donor_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure donor properties POST properly (via workbook)."""
    get_item(es_testapp, "078256f2-e8b4-48eb-8a53-9bd2b01cda72")
