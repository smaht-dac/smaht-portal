import pytest
from webtest import TestApp

from .utils import get_item, get_search, patch_item
from ..item_utils import item as item_utils


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for aligned reads file
    within SubmittedFile collection.
    """
    get_item(
        es_testapp,
        "TEST_ALIGNED-READS_SOME_BAM",
        collection="SubmittedFile",
        status=301,
    )


@pytest.mark.workbook
def test_derived_from(es_testapp: TestApp, workbook: None) -> None:
    """Ensure `derived_from` can link to an OutputFile or SubmittedFile."""
    aligned_reads_search = get_search(es_testapp, "?type=AlignedReads")
    assert aligned_reads_search, "No AlignedReads found in workbook"
    aligned_reads = aligned_reads_search[0]
    aligned_reads_uuid = item_utils.get_uuid(aligned_reads)

    output_file_search = get_search(es_testapp, "?type=OutputFile")
    assert output_file_search, "No OutputFile found in workbook"
    output_file = output_file_search[-1]

    submitted_file_search = get_search(
        es_testapp, f"?type=SubmittedFile&uuid!={aligned_reads_uuid}"
    )
    assert submitted_file_search, "No suitable SubmittedFile found in workbook"
    submitted_file = submitted_file_search[0]

    patch_body = {
        "derived_from": [
            item_utils.get_uuid(output_file),
            item_utils.get_submitted_id(submitted_file),
        ]
    }
    patch_item(es_testapp, patch_body, aligned_reads_uuid)
