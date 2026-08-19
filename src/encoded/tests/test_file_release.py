from contextlib import contextmanager
from unittest import mock

import pytest
from webtest import TestApp

from .utils import get_search
from ..commands.release_file import (
    FileRelease,
    get_archive_summary,
    warning_text,
)
from ..item_utils import (
    file as file_utils,
    item as item_utils,
    supplementary_file as supp_file_utils,
    external_output_file as eof_utils,
)
from ..item_utils.utils import RequestHandler


@contextmanager
def patch_get_request_handler(testapp: TestApp) -> mock.MagicMock:
    with mock.patch(
        "encoded.commands.release_file.FileRelease.get_request_handler",
        return_value=RequestHandler(test_app=testapp),
    ) as mock_get_request_handler:
        yield mock_get_request_handler


@contextmanager
def patch_get_request_handler_embedded(testapp: TestApp) -> mock.MagicMock:
    with mock.patch(
        "encoded.commands.release_file.FileRelease.get_request_handler_embedded",
        return_value=RequestHandler(test_app=testapp, frame="embedded"),
    ) as mock_get_request_handler_embedded:
        yield mock_get_request_handler_embedded


# We need to break this up in two context managers to avoid too many nested mocks
@contextmanager
def patch_file_release_properties():
    """Patch FileRelease properties that return lists."""
    with (
        mock.patch(
            "encoded.commands.release_file.FileRelease.software",
            return_value=None,
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.get_output_meta_workflow_run",
            return_value=None,
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.validate_required_qc_runs",
            return_value=None,
        ),
        # Patch the method and not the `files_to_archive` cached property, so
        # that the property caches a real empty list
        mock.patch(
            "encoded.commands.release_file.FileRelease.get_files_to_archive",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.library_preparations",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.analyte_preparations",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.preparation_kits",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.treatments", return_value=[]
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.tissues", return_value=[]
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.tissue_samples", return_value=[]
        ),
    ):
        yield


@contextmanager
def patch_file_release_donor_properties():
    """Patch FileRelease donor-related properties."""
    with (
        mock.patch("encoded.commands.release_file.FileRelease.donors", return_value=[]),
        mock.patch(
            "encoded.commands.release_file.FileRelease.protected_donors",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.demographics", return_value=[]
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.death_circumstances",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.family_histories",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.tissue_collections",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.medical_histories",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.diagnoses", return_value=[]
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.exposures", return_value=[]
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.medical_treatments",
            return_value=[],
        ),
    ):
        yield


@pytest.mark.workbook
def test_file_release(es_testapp: TestApp, workbook: None) -> None:
    """Test file release process for select files.

    Only ensuring the preparation stage functions without bugs, not
    actually patching anything here.
    """
    query = "?type=File&annotated_filename!=No+value"  # Since already set up
    files_to_release = get_search(es_testapp, query)
    assert files_to_release, "No files to release found."

    with (
        patch_get_request_handler(es_testapp),
        patch_get_request_handler_embedded(es_testapp),
        patch_file_release_properties(),
        patch_file_release_donor_properties(),
    ):
        for file in files_to_release:
            dataset = file_utils.get_dataset(file) or FileRelease.TISSUE
            identifier = item_utils.get_uuid(file)
            file_release = FileRelease({}, identifier)
            file_release.prepare(dataset)
            if not supp_file_utils.is_reference_conversion(
                file
            ) and not supp_file_utils.is_genome_assembly(
                file
            ) and not eof_utils.is_external_output_file(
                file
            ):
                assert file_release.file_sets
            assert file_release.libraries
            assert file_release.assays
            assert file_release.sequencings
            assert file_release.analytes
            assert file_release.samples
            assert file_release.sample_sources
            assert file_release.cell_lines or file_release.donors
            assert file_release.patch_infos
            assert file_release.patch_dicts


def make_file_release(**attributes) -> FileRelease:
    """Build a FileRelease without going through __init__ (which hits the portal).

    Cached properties can be seeded by writing them into the instance dict.
    """
    file_release = FileRelease.__new__(FileRelease)
    file_release.key = {}
    file_release.archive_files = True
    file_release.patch_dicts = []
    file_release.patch_infos = []
    file_release.patch_infos_minimal = []
    file_release.warnings = []
    for name, value in attributes.items():
        setattr(file_release, name, value)
    return file_release


def make_file(
    item_type: str = "UnalignedReads",
    file_format: str = "fastq_gz",
    uuid: str = "uuid",
    **properties,
) -> dict:
    return {
        "@type": [item_type, "File", "Item"],
        "accession": f"SMAFI{uuid}",
        "file_format": {"display_title": file_format},
        "uuid": uuid,
        **properties,
    }


def test_get_archive_summary() -> None:
    """Test that files to archive are counted by item type and file format."""
    files = (
        [make_file(uuid=f"fastq-{index}") for index in range(12)]
        + [
            make_file(item_type="AlignedReads", file_format="cram", uuid=f"cram-{index}")
            for index in range(2)
        ]
    )
    assert get_archive_summary(files) == (
        f"\nArchiving {warning_text('14')} files:"
        " 12 UnalignedReads (fastq_gz), 2 AlignedReads (cram)"
    )


@pytest.mark.parametrize(
    "file,expect_search",
    [
        (make_file(output_status="Final Output", file_format="bam"), True),
        (make_file(output_status="Final Output", file_format="cram"), True),
        (make_file(output_status="Final Output", file_format="vcf_gz"), False),
        (make_file(file_format="bam"), False),  # Not a final output
        (make_file(item_type="UnalignedReads"), False),
        (make_file(item_type="ExternalOutputFile", file_format="bam"), False),
        (make_file(item_type="SupplementaryFile", file_format="fa"), False),
    ],
)
def test_get_files_to_archive_gate(file: dict, expect_search: bool) -> None:
    """Test that only final output BAMs and CRAMs trigger a lookup."""
    file_release = make_file_release(file=file, file_sets=[{"uuid": "file-set-uuid"}])
    with mock.patch(
        "encoded.commands.release_file.ff_utils.search_metadata", return_value=[]
    ) as mocked_search:
        assert file_release.get_files_to_archive() == []
    assert mocked_search.call_count == (3 if expect_search else 0)


def test_get_files_to_archive_is_opt_in() -> None:
    """Test that nothing is archived unless archiving is requested."""
    file_release = make_file_release(
        file=make_file(output_status="Final Output", file_format="bam"),
        file_sets=[{"uuid": "file-set-uuid"}],
        archive_files=False,
    )
    with mock.patch(
        "encoded.commands.release_file.ff_utils.search_metadata", return_value=[]
    ) as mocked_search:
        assert file_release.get_files_to_archive() == []
    assert mocked_search.call_count == 0


def test_get_files_to_archive_without_file_sets() -> None:
    """Test that nothing is archived when the file has no file sets."""
    file_release = make_file_release(
        file=make_file(output_status="Final Output", file_format="bam"), file_sets=[]
    )
    with mock.patch(
        "encoded.commands.release_file.ff_utils.search_metadata", return_value=[]
    ) as mocked_search:
        assert file_release.get_files_to_archive() == []
    assert mocked_search.call_count == 0


def test_add_archive_files_to_patchdict() -> None:
    """Test that only the files that need archiving get a patch dict."""
    released_file = make_file(item_type="OutputFile", uuid="released")
    file_release = make_file_release(
        files_to_archive=[
            make_file(uuid="to-archive", submitted_id="TEST_UNALIGNED-READS_R1"),
            released_file,  # Already being released
            make_file(uuid="archived", s3_lifecycle_category="long_term_archive"),
            make_file(uuid="deleted", s3_lifecycle_category="no_storage"),
            make_file(uuid="reassigned", s3_lifecycle_category="short_term_access"),
        ],
    )
    file_release.patch_dicts = [{"uuid": "released", "status": "open"}]

    file_release.add_archive_files_to_patchdict()

    assert file_release.patch_dicts[1:] == [
        {"uuid": "to-archive", "s3_lifecycle_category": "long_term_archive"},
    ]
    assert file_release.patch_infos_minimal[0] == (
        f"\nArchiving {warning_text('1')} files: 1 UnalignedReads (fastq_gz)"
    )
    # Both the submitted ID and the accession are reported
    assert file_release.patch_infos[1] == (
        "\nUnalignedReads (TEST_UNALIGNED-READS_R1, SMAFIto-archive):"
    )
    # An existing lifecycle category is reported but never overwritten. Files
    # that are already archived don't need to be reported.
    assert len(file_release.warnings) == 2
    assert "no_storage" in file_release.warnings[0]
    assert "short_term_access" in file_release.warnings[1]


def test_add_archive_files_to_patchdict_nothing_to_archive() -> None:
    """Test that no summary is reported when there is nothing to archive."""
    file_release = make_file_release(files_to_archive=[])

    file_release.add_archive_files_to_patchdict()

    assert file_release.patch_dicts == []
    assert file_release.patch_infos == []
    assert file_release.patch_infos_minimal == []
