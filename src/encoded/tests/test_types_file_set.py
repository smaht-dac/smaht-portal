import pytest
from webtest import TestApp

from .utils import get_search


@pytest.mark.workbook
def test_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure files rev link works."""
    file_set_search = get_search(
        es_testapp, "?type=FileSet&files.uuid!=No+value"
    )
    assert file_set_search
