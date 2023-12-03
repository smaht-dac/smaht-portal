import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_unaligned_reads_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure file properties POST properly (via workbook)."""
    get_item(es_testapp, "21902743-3067-4fa5-b719-074512c54e54")
