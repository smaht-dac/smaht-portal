import pytest
from webtest import TestApp

from .utils import get_search


FILE_SET_ID = 'b98f9849-3b7f-4f2f-a58f-81100954e00d'


@pytest.mark.workbook
def test_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure files rev link works."""
    file_set_search = get_search(es_testapp, "?type=FileSet&files.uuid!=No+value")
    assert file_set_search


@pytest.mark.workbook
def test_file_set_merge_group(es_testapp: TestApp, workbook: None) -> None:
    """ Ensure we generate a reasonable looking group when file set data is present """
    res = es_testapp.get('/file-sets/b98f9849-3b7f-4f2f-a58f-81100954e00d/').json
    assert res['file_merge_group'] == 'smaht-test_tissue_liver-illumina_novaseqx-paired-end-150-r9-bulk_wgs'
