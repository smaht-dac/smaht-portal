import pytest
from webtest import TestApp

from .utils import get_item

@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for supplementary file
    within SupplementaryFile and SubmittedFile collections.
    """

    get_item(
        es_testapp,
        "TEST_SUPPLEMENTARY-FILE_HELA_FASTA",
        collection="SupplementaryFile",
        status=301,
    )

    get_item(
        es_testapp,
        "TEST_SUPPLEMENTARY-FILE_HELA_FASTA",
        collection="SubmittedFile",
        status=301,
    )