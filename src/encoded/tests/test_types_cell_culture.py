import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for cell culture within
    SampleSource collection.
    """
    get_item(es_testapp, "TEST_CELL-CULTURE_HELA", collection="SampleSource", status=301)
