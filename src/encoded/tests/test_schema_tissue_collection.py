import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_tissue_collection_post(es_testapp: TestApp, workbook: None) -> None:
    """Ensure tissue collection properties POST properly (via workbook)."""
    get_item(es_testapp, "3ab98947-6edb-437b-a893-d350bdd1ca47")
