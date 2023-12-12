import pytest
from webtest.app import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_identifier_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'identifier' is available resource path within collection.

    Note: Must match a Page 'identifier' in workbook-inserts.
    """
    get_item(es_testapp, "about")
