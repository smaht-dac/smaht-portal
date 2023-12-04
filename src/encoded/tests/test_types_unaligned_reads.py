import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for unaligned reads file."""
    get_item(es_testapp, "TEST_FILE_FASTQ", collection="UnalignedReads", status=301)
    get_item(es_testapp, "TEST_FILE_FASTQ", collection="SubmittedFile", status=301)
