from typing import Dict, Any
import pytest
from webtest.app import TestApp
from dataclasses import dataclass
from .test_permissions import post_item_to_fail, post_item_then_delete


from .utils import (
    get_search,
    get_insert_identifier_for_item_type,
    patch_item,
    post_item,
    get_item
)

FILE_SET_ID = 'b98f9849-3b7f-4f2f-a58f-81100954e00d'


@pytest.mark.workbook
def test_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure files rev link works."""
    file_set_search = get_search(es_testapp, "?type=FileSet&files.uuid!=No+value")
    assert file_set_search


@pytest.mark.workbook
def test_file_set_group(es_testapp: TestApp, workbook: None) -> None:
    """ Ensure we generate a reasonable looking group when file set data is present """
    res = es_testapp.get('/file-sets/b98f9849-3b7f-4f2f-a58f-81100954e00d/').json
    file_merge_group = res['file_group']
    assert file_merge_group['sample_source'] == 'TEST_TISSUE-SAMPLE_LIVER'
    assert file_merge_group['sequencing'] == 'illumina_novaseqx-Paired-end-150-R9'
    assert file_merge_group['assay'] == 'bulk_wgs'


@pytest.mark.workbook
@pytest.mark.parametrize(
    "library,sequencing,expected_status",
    [
        ("TEST_LIBRARY_LIVER-HOMOGENATE","TEST_SEQUENCING_PACBIO_30X-30H",200), # FiberSeq and PacBio
        ("TEST_LIBRARY_LIVER-HOMOGENATE","TEST_SEQUENCING_ONT-90X",422), # FiberSeq and ONT
        ("TEST_LIBRARY_HELA-HEK293","TEST_SEQUENCING_NOVASEQ-500X", 422), # bulk_wgs and ONT
        ("TEST_LIBRARY_HELA-HEK293","TEST_SEQUENCING_ONT-90X", 200), #Cas9 Nanopore and ONT
        ("TEST_LIBRARY_LIVER","TEST_SEQUENCING_NOVASEQ-500X",200) #bulk_wgs and Illumina NovaSeqX
    ],
)
def test_validate_compatible_assay_and_sequencer_on_patch(
    es_testapp: TestApp,
    library: str,
    sequencing: str,
    expected_status: int,
) -> None:
    """Ensure file set assay and sequencer validated on PATCH.

    Note: Permissible combinations of assay and sequencer are determined by `conditionally_dependent`.
    """
    library_uuid=get_item(
        es_testapp,
        library,
        'Library'
    ).get("uuid","")
    sequencing_uuid=get_item(
        es_testapp,
        sequencing,
        'Sequencing'
    ).get("uuid","")
    identifier = get_insert_identifier_for_item_type(es_testapp,'file_set')
    patch_body = {
        "libraries": [library_uuid],
        "sequencing": sequencing_uuid
    }
    patch_item(es_testapp, patch_body, identifier, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "library,sequencing,expected_status",
    [
        ("TEST_LIBRARY_LIVER-HOMOGENATE","TEST_SEQUENCING_PACBIO_30X-30H",200), # FiberSeq and PacBio
        ("TEST_LIBRARY_LIVER-HOMOGENATE","TEST_SEQUENCING_ONT-90X",422), # FiberSeq and ONT
        ("TEST_LIBRARY_HELA-HEK293","TEST_SEQUENCING_NOVASEQ-500X", 422), # bulk_wgs and ONT
        ("TEST_LIBRARY_HELA-HEK293","TEST_SEQUENCING_ONT-90X", 200), #Cas9 Nanopore and ONT
        ("TEST_LIBRARY_LIVER","TEST_SEQUENCING_NOVASEQ-500X",200) #bulk_wgs and Illumina NovaSeqX
    ],
)
def test_validate_compatible_assay_and_sequencer_on_post(
    es_testapp: TestApp,
    library: str,
    sequencing: str,
    expected_status: int,
) -> None:
    """Ensure file set assay and sequencer validated on POST.

    Note: Permissible combinations of assay and sequencer are determined by `conditionally_dependent`.
    """
    submission_center = get_insert_identifier_for_item_type(es_testapp,'submission_center')
    library_uuid=get_item(
        es_testapp,
        library,
        'Library'
    ).get("uuid","")
    sequencing_uuid=get_item(
        es_testapp,
        sequencing,
        'Sequencing'
    ).get("uuid","")
    post_body = {
        "submitted_id": 'TEST_FILE-SET_TEST',
        "submission_centers": [submission_center],
        "libraries": [library_uuid],
        "sequencing": sequencing_uuid
    }
    if expected_status == 422:
        post_item_to_fail(es_testapp,"file_set",post_body)
    elif expected_status == 200:
        post_item_then_delete(es_testapp,es_testapp,"file_set",post_body)

