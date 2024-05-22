import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure identifier is available resource path for new type within collection.

    Note: Must match a New Type 'identifier' in temp-local-inserts
    """
    get_item(es_testapp, "NT1", collection="NewType", status=301)

