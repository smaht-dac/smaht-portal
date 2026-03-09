import pytest
from webtest.app import TestApp

from .utils import (
    get_search,
)


@pytest.mark.workbook
def test_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure files rev link works."""
    file_set_search = get_search(es_testapp, "?type=AnalysisRun&files.uuid!=No+value")
    assert file_set_search


@pytest.mark.workbook
def test_metaworflow_run_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure files rev link works."""
    mwfr_search = get_search(es_testapp, "?type=AnalysisRun&meta_workflow_runs.uuid!=No+value")
    assert mwfr_search

