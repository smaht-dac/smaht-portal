import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for non-brain pathology report with PathologyReport collection.
    """
    get_item(
        es_testapp, "TEST_NON-BRAIN-PATHOLOGY-REPORT_SMHT001-1A-100A1", collection="PathologyReport",
        status=301
    )