import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for tissue collection."""
    get_item(
        es_testapp,
        "TEST_TISSUE-COLLECTION_FEMALE",
        collection="TissueCollection",
        status=301,
    )
