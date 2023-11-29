import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for cell sample."""
    get_item(es_testapp, "TEST_SAMPLE_LIVER-CELL", collection="CellSample", status=301)
    get_item(es_testapp, "TEST_SAMPLE_LIVER-CELL", collection="Sample", status=301)
