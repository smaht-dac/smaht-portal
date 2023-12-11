import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for tissue within
    SampleSource collection.
    """
    get_item(es_testapp, "TEST_TISSUE_LIVER", collection="SampleSource", status=301)
