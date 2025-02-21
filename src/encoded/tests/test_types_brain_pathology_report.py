import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for brain pathology report with PathologyReport collection.
    """
    get_item(
        es_testapp, "TEST_BRAIN-PATHOLOGY-REPORT_SMHT001-3AJ-001S1", collection="PathologyReport",
        status=301
    )