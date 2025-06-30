import pytest
from typing import List, Dict, Any
from webtest.app import TestApp

from .utils import (
    get_search,
    get_insert_identifier_for_item_type,
    patch_item,
    post_item,
    get_item,
)

from ..item_utils import (
    item as item_utils,
)

FILE_SET_ID = "b98f9849-3b7f-4f2f-a58f-81100954e00d"

@pytest.mark.workbook
def test_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure files rev link works."""
    file_set_search = get_search(es_testapp, "?type=FileSet&files.uuid!=No+value")
    assert file_set_search


@pytest.mark.workbook
@pytest.mark.parametrize(
    "file_set,sample_source,sequencing,assay,group_tag", [
        ('/file-sets/b98f9849-3b7f-4f2f-a58f-81100954e00d/', 'TEST_TISSUE-SAMPLE_LIVER', 'illumina_novaseqx-Paired-end-150-R9', 'bulk_wgs', ''), # single intact tissue sample
        ('/file-sets/799ca2e9-f24a-4517-bb35-88945ed41047/','TEST_TISSUE-SAMPLE_LIVER', 'illumina_novaseqx-Paired-end-150-R9', 'bulk_wgs', 'group1'), # group_tag
        ('/file-sets/8a55c725-eb48-4ef9-9a54-9271bdf11239/','TEST_TISSUE_LUNG', 'pacbio_revio_hifi-Single-end-20000-no-flow-cell', 'bulk_fiberseq', ''), # merged tissue homogenates
        ('/file-sets/b9f0f412-927f-4129-b165-f6a99935a44f/','TEST_CELL-CULTURE_HELA', 'pacbio_revio_hifi-Single-end-20000-no-flow-cell', 'bulk_mas_iso_seq', ''), # cell culture sample,
        ("/file-sets/6ae8d017-88f8-4fe7-8d6d-849f979836c9/",'TEST_TISSUE_LIVER', 'illumina_novaseqx-Paired-end-150-R9', 'bulk_wgs', ''), # merged intact tissues
    ]
)
def test_file_set_group(
    es_testapp: TestApp,
    workbook: None,
    file_set: str,
    sample_source: str,
    sequencing: str,
    assay: str,
    group_tag: str
) -> None:
    """ Ensure we generate a reasonable looking group when file set data is present """
    res = es_testapp.get(file_set).json
    file_merge_group = res['file_group']
    assert file_merge_group['sample_source'] == sample_source
    assert file_merge_group['sequencing'] == sequencing
    assert file_merge_group['assay'] == assay
    assert file_merge_group['group_tag'] == group_tag


@pytest.mark.workbook
@pytest.mark.parametrize(
    "file_set", [
        ('/file-sets/6b6531f3-7512-4ed4-8d88-b0807579f883/'), # multiple sample sources
        ('/file-sets/149773c9-3c1c-48fd-8ac8-6466ab1dbcc7/'), # single-cell
    ]
)
def test_file_set_missing_file_group(
    es_testapp: TestApp,
    workbook: None,
    file_set: str,
) -> None:
    """ Ensure that file_group is not generated for file sets where it is not appropriate."""
    res = es_testapp.get(file_set).json
    assert 'file_group' not in res


@pytest.mark.workbook
@pytest.mark.parametrize(
    "submitted_id,expected",
    [
        ("TEST_FILE-SET_LUNG-HOMOGENATE-DNA",["Lung"]),
        ("TEST_FILE-SET_LIVER-DNA",["Liver"])
    ]
)
def test_file_set_tissue_types(
    es_testapp: TestApp,
    submitted_id: str,
    expected: List[str],
    workbook: None
) -> None:
    """Ensure the tissue_types calcprop works."""
    fileset=get_item(
        es_testapp,
        submitted_id,
        collection='FileSet',
    )
    assert fileset.get("tissue_types",[]) == expected


@pytest.mark.workbook
@pytest.mark.parametrize(
    "library,sequencing,expected_status",
    [
        ("TEST_LIBRARY_LUNG-HOMOGENATE-DNA","TEST_SEQUENCING_PACBIO_30X-30H-DNA", 200), # FiberSeq and PacBio
        ("","TEST_SEQUENCING_ONT-90X-DNA", 422), # FiberSeq and ONT
        ("TEST_LIBRARY_HELA-HEK293-DNA","", 422), # Cas9 Nanopore and PacBio
        ("TEST_LIBRARY_LUNG-HOMOGENATE-DNA","TEST_SEQUENCING_ONT-90X-DNA", 422), # FiberSeq and ONT
        ("TEST_LIBRARY_HELA-HEK293-DNA","TEST_SEQUENCING_NOVASEQ-500X-DNA", 422), # bulk_wgs and ONT
        ("TEST_LIBRARY_HELA-HEK293-DNA","TEST_SEQUENCING_ONT-90X-DNA", 200), #Cas9 Nanopore and ONT
        ("TEST_LIBRARY_LIVER-DNA","TEST_SEQUENCING_NOVASEQ-500X-DNA", 200), #bulk_wgs and Illumina NovaSeqX
        ("TEST_LIBRARY_HELA-RNA","TEST_SEQUENCING_NOVASEQ-500X-RNA", 200), # RNA with target_read_count
        ("TEST_LIBRARY_HELA-RNA","TEST_SEQUENCING_NOVASEQ-500X-DNA", 422), # RNA with target_coverage
        ("TEST_LIBRARY_LIVER-DNA","TEST_SEQUENCING_NOVASEQ-500X-RNA", 200), # DNA with target_read_count
        ("TEST_LIBRARY_LIVER-DNA","TEST_SEQUENCING_NOVASEQ-500X-DNA", 200), # DNA with target_coverage
    ],
)
def test_validate_compatible_library_and_sequencer_on_patch(
    es_testapp: TestApp,
    workbook: None,
    library: str,
    sequencing: str,
    expected_status: int,
) -> None:
    """Ensure file set assay and sequencer validated on PATCH.

    Note: Permissible combinations of assay and sequencer are determined by `Assay.valid_sequencers property` and based off of molecule-specific properties of sequencing.
    """
    patch_body = {}
    if library:
        library_uuid=item_utils.get_uuid(
            get_item(
                es_testapp,
                library,
                'Library'
            )
        )
        patch_body['libraries'] = [library_uuid]
    if sequencing:
        sequencing_uuid=item_utils.get_uuid(
            get_item(
                es_testapp,
                sequencing,
                'Sequencing'
            )
        )
        patch_body['sequencing'] = sequencing_uuid
    identifier = get_insert_identifier_for_item_type(es_testapp,'file_set')
    patch_item(es_testapp, patch_body, identifier, status=expected_status)


@pytest.mark.workbook
@pytest.mark.parametrize(
    "library,sequencing,expected_status,index",
    [
        ("TEST_LIBRARY_LUNG-HOMOGENATE-DNA","TEST_SEQUENCING_PACBIO_30X-30H-DNA", 201, 1), # FiberSeq and PacBio
        ("TEST_LIBRARY_LUNG-HOMOGENATE-DNA","TEST_SEQUENCING_ONT-90X-DNA", 422, 2), # FiberSeq and ONT
        ("TEST_LIBRARY_HELA-HEK293-DNA","TEST_SEQUENCING_NOVASEQ-500X-DNA", 422, 3), # bulk_wgs and ONT
        ("TEST_LIBRARY_HELA-HEK293-DNA","TEST_SEQUENCING_ONT-90X-DNA", 201, 4), #Cas9 Nanopore and ONT
        ("TEST_LIBRARY_LIVER-DNA","TEST_SEQUENCING_NOVASEQ-500X-DNA", 201, 5), #bulk_wgs and Illumina NovaSeqX
        ("TEST_LIBRARY_HELA-RNA","TEST_SEQUENCING_NOVASEQ-500X-RNA", 201, 6), # RNA with target_read_count
        ("TEST_LIBRARY_HELA-RNA","TEST_SEQUENCING_NOVASEQ-500X-DNA", 422, 7), # RNA with target_coverage
        ("TEST_LIBRARY_LIVER-DNA","TEST_SEQUENCING_NOVASEQ-500X-RNA", 201, 8), # DNA with target_read_count
        ("TEST_LIBRARY_LIVER-DNA","TEST_SEQUENCING_NOVASEQ-500X-DNA", 201, 9), # DNA with target_coverage
    ],
)
def test_validate_compatible_library_and_sequencer_on_post(
    es_testapp: TestApp,
    workbook: None,
    library: str,
    sequencing: str,
    expected_status: int,
    index: int
) -> None:
    """Ensure file set assay and sequencer validated on POST.

   Note: Permissible combinations of assay and sequencer are determined by `Assay.valid_sequencers property` and based off of molecule-specific properties of sequencing.
    """
    submission_center = get_insert_identifier_for_item_type(es_testapp,'submission_center')
    library_uuid=item_utils.get_uuid(
        get_item(
            es_testapp,
            library,
            'Library'
        )
    )
    sequencing_uuid=item_utils.get_uuid(
        get_item(
            es_testapp,
            sequencing,
            'Sequencing'
        )
    )
    post_body = {
        "submitted_id": f"TEST_FILE-SET_TEST{index}",
        "submission_centers": [submission_center],
        "libraries": [library_uuid],
        "sequencing": sequencing_uuid
    }
    post_item(es_testapp,post_body,'file_set',status=expected_status)